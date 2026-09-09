import { AudioDecodingError } from '../../core/audio/AudioPreparationError';
import { assertDecodedMediaWithinBudget, assertEncodedMediaWithinBudget } from '../../core/audio/MediaWorkBudget';
import { throwIfAborted } from '../../core/utils/CooperativeTask';
import wmaWasmBase64 from '../../vendor/wma-standard/wma-standard.wasm.bin';
import wmaWorkerSource from '../../vendor/wma-standard/wma-standard.worker.txt';

const AVMEDIA_TYPE_AUDIO = 1;
const AVERROR_EAGAIN = -6;
const AVERROR_EOF = -541478725;
const TARGET_SAMPLE_RATE = 16_000;
const TARGET_SAMPLE_FORMAT_FLOAT = 3;
const MONO_CHANNEL_LAYOUT = 4;
const STEREO_CHANNEL_LAYOUT = 3;
const READ_PACKET_LIMIT_BYTES = 1024 * 1024;
const DECODE_TIMEOUT_MS = 5 * 60 * 1000;
const ASF_HEADER_GUID = [
	0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
	0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c
] as const;

interface LibAvStream {
	index: number;
	codecpar: number;
	codec_type: number;
	codec_id: number;
	time_base_num: number;
	time_base_den: number;
	duration: number;
}

interface LibAvFrame {
	data: Float32Array | Float32Array[];
	format: number;
	channels?: number;
	nb_samples?: number;
	sample_rate?: number;
}

type LibAvPackets = Record<string, unknown[]>;
type WorkerReply = [number | string, string, boolean, unknown];

interface PendingCall {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

export interface DecodedWmaAudio {
	pcmData: Float32Array;
	sampleRate: number;
	duration: number;
	channels: 1;
	codec: 'wmav1' | 'wmav2';
}

export async function decodeWmaStandard(
	data: ArrayBuffer,
	signal?: AbortSignal
): Promise<DecodedWmaAudio> {
	throwIfAborted(signal);
	assertEncodedMediaWithinBudget(data.byteLength);
	assertAsfHeader(data);

	const decoder = new WmaWorkerClient();
	const timeoutId = window.setTimeout(() => {
		decoder.terminate(new AudioDecodingError('WMA decoding timed out.'));
	}, DECODE_TIMEOUT_MS);
	const abortHandler = (): void => {
		decoder.terminate(new DOMException('WMA decoding was cancelled', 'AbortError'));
	};
	signal?.addEventListener('abort', abortHandler, { once: true });

	try {
		return await decoder.decode(data, signal);
	} catch (error) {
		if (signal?.aborted) {
			throw new DOMException('WMA decoding was cancelled', 'AbortError');
		}
		if (error instanceof AudioDecodingError) {
			throw error;
		}
		throw new AudioDecodingError(
			`Failed to decode WMA Standard audio: ${formatUnknownError(error)}`,
			error
		);
	} finally {
		window.clearTimeout(timeoutId);
		signal?.removeEventListener('abort', abortHandler);
		decoder.terminate();
	}
}

class WmaWorkerClient {
	private readonly workerUrl: string;
	private readonly wasmUrl: string;
	private readonly worker: Worker;
	private readonly pending = new Map<number, PendingCall>();
	private readonly ready: Promise<void>;
	private resolveReady: (() => void) | null = null;
	private rejectReady: ((error: Error) => void) | null = null;
	private nextCallId = 1;
	private terminated = false;

	constructor() {
		const wasmBytes = decodeBase64(wmaWasmBase64);
		const wasmBuffer = wasmBytes.buffer.slice(
			wasmBytes.byteOffset,
			wasmBytes.byteOffset + wasmBytes.byteLength
		) as ArrayBuffer;
		this.wasmUrl = URL.createObjectURL(new Blob(
			[wasmBuffer],
			{ type: 'application/wasm' }
		));
		this.workerUrl = URL.createObjectURL(new Blob(
			[wmaWorkerSource],
			{ type: 'text/javascript' }
		));
		this.worker = new Worker(this.workerUrl, { name: 'ai-transcriber-wma-decoder' });
		this.ready = new Promise<void>((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		this.worker.onmessage = (event: MessageEvent<WorkerReply>) => this.handleMessage(event.data);
		this.worker.onerror = (event) => {
			this.terminate(new AudioDecodingError(event.message || 'WMA decoder worker failed.'));
		};
		this.worker.postMessage({
			config: {
				variant: 'wma-standard',
				wasmurl: this.wasmUrl
			}
		});
	}

	async decode(data: ArrayBuffer, signal?: AbortSignal): Promise<DecodedWmaAudio> {
		await this.ready;
		throwIfAborted(signal);

		const inputBytes = new Uint8Array(data.slice(0)) as Uint8Array & {
			libavjsTransfer?: Transferable[];
		};
		inputBytes.libavjsTransfer = [inputBytes.buffer];
		await this.call('writeFile', 'input.wma', inputBytes);

		const [formatContext, streams] = await this.call<[number, LibAvStream[]]>(
			'ff_init_demuxer_file',
			'input.wma'
		);
		const audioStreams = streams.filter(stream => stream.codec_type === AVMEDIA_TYPE_AUDIO);
		const stream = audioStreams[0];
		if (audioStreams.length !== 1 || !stream) {
			throw new AudioDecodingError('WMA file must contain exactly one audio stream.');
		}

		const codecName = await this.call<string>('avcodec_get_name', stream.codec_id);
		if (codecName !== 'wmav1' && codecName !== 'wmav2') {
			throw new AudioDecodingError(
				`Unsupported WMA codec '${codecName}'. Only WMA Standard is supported.`
			);
		}

		const [, codecContext, packet, frame] = await this.call<[number, number, number, number]>(
			'ff_init_decoder',
			stream.codec_id,
			{
				codecpar: stream.codecpar,
				time_base: [stream.time_base_num, stream.time_base_den]
			}
		);
		const sampleFormat = await this.call<number>('AVCodecContext_sample_fmt', codecContext);
		const sampleRate = await this.call<number>('AVCodecContext_sample_rate', codecContext);
		const channels = await this.call<number>('AVCodecContext_ch_layout_nb_channels', codecContext);
		if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000
			|| (channels !== 1 && channels !== 2)) {
			throw new AudioDecodingError('WMA channel count or sample rate is unsupported.');
		}
		if (Number.isFinite(stream.duration) && stream.duration > 0) {
			assertDecodedMediaWithinBudget(
				data.byteLength,
				{
					length: Math.ceil(stream.duration * sampleRate),
					sampleRate,
					duration: stream.duration,
					numberOfChannels: channels
				},
				TARGET_SAMPLE_RATE
			);
		}

		const [, filterSource, filterSink] = await this.call<[number, number, number]>(
			'ff_init_filter_graph',
			'aresample=16000,aformat=sample_fmts=flt:channel_layouts=mono',
			{
				type: AVMEDIA_TYPE_AUDIO,
				sample_rate: sampleRate,
				sample_fmt: sampleFormat,
				channel_layout: channels === 1 ? MONO_CHANNEL_LAYOUT : STEREO_CHANNEL_LAYOUT,
				time_base: [1, sampleRate]
			},
			{
				type: AVMEDIA_TYPE_AUDIO,
				sample_rate: TARGET_SAMPLE_RATE,
				sample_fmt: TARGET_SAMPLE_FORMAT_FLOAT,
				channel_layout: MONO_CHANNEL_LAYOUT,
				time_base: [1, TARGET_SAMPLE_RATE]
			}
		);

		const pcmBlocks: Float32Array[] = [];
		let totalSamples = 0;
		for (;;) {
			throwIfAborted(signal);
			const [readResult, packetsByStream] = await this.call<[number, LibAvPackets]>(
				'ff_read_frame_multi',
				formatContext,
				packet,
				{ limit: READ_PACKET_LIMIT_BYTES }
			);
			const endOfFile = readResult === AVERROR_EOF;
			if (readResult < 0 && readResult !== AVERROR_EAGAIN && !endOfFile) {
				throw new AudioDecodingError(`WMA demuxing failed with code ${readResult}.`);
			}
			const packets = packetsByStream[String(stream.index)] ?? [];
			const frames = await this.call<LibAvFrame[]>(
				'ff_decode_filter_multi',
				codecContext,
				filterSource,
				filterSink,
				packet,
				frame,
				packets,
				{ fin: endOfFile }
			);
			for (const decodedFrame of frames) {
				if (decodedFrame.format !== TARGET_SAMPLE_FORMAT_FLOAT
					|| decodedFrame.sample_rate !== TARGET_SAMPLE_RATE
					|| decodedFrame.channels !== 1
					|| !(decodedFrame.data instanceof Float32Array)) {
					throw new AudioDecodingError('WMA decoder returned an unexpected PCM format.');
				}
				pcmBlocks.push(decodedFrame.data);
				totalSamples += decodedFrame.data.length;
				assertOutputBudget(data.byteLength, totalSamples);
			}
			if (endOfFile) {
				break;
			}
		}

		if (totalSamples === 0) {
			throw new AudioDecodingError('WMA decoding produced no audio samples.');
		}
		const pcmData = new Float32Array(totalSamples);
		let writeOffset = 0;
		for (const block of pcmBlocks) {
			pcmData.set(block, writeOffset);
			writeOffset += block.length;
		}
		return {
			pcmData,
			sampleRate: TARGET_SAMPLE_RATE,
			duration: totalSamples / TARGET_SAMPLE_RATE,
			channels: 1,
			codec: codecName
		};
	}

	terminate(error: Error = new AudioDecodingError('WMA decoder stopped.')): void {
		if (this.terminated) {
			return;
		}
		this.terminated = true;
		this.worker.terminate();
		URL.revokeObjectURL(this.workerUrl);
		URL.revokeObjectURL(this.wasmUrl);
		this.rejectReady?.(error);
		this.rejectReady = null;
		this.resolveReady = null;
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}

	private async call<T>(functionName: string, ...args: unknown[]): Promise<T> {
		await this.ready;
		if (this.terminated) {
			throw new AudioDecodingError('WMA decoder is no longer available.');
		}
		const callId = this.nextCallId++;
		const transferables = args.flatMap((argument) => getTransferables(argument));
		return await new Promise<T>((resolve, reject) => {
			this.pending.set(callId, {
				resolve: value => resolve(value as T),
				reject
			});
			this.worker.postMessage([callId, functionName, ...args], transferables);
		});
	}

	private handleMessage(reply: WorkerReply): void {
		const [id, , succeeded, value] = reply;
		if (id === 'onready') {
			this.resolveReady?.();
			this.resolveReady = null;
			this.rejectReady = null;
			return;
		}
		if (id === 'error') {
			this.terminate(new AudioDecodingError(formatUnknownError(value)));
			return;
		}
		if (typeof id !== 'number') {
			return;
		}
		const pending = this.pending.get(id);
		if (!pending) {
			return;
		}
		this.pending.delete(id);
		if (succeeded) {
			pending.resolve(value);
		} else {
			pending.reject(new AudioDecodingError(formatUnknownError(value)));
		}
	}
}

function assertAsfHeader(data: ArrayBuffer): void {
	if (data.byteLength < ASF_HEADER_GUID.length) {
		throw new AudioDecodingError('WMA/ASF header is truncated.');
	}
	const header = new Uint8Array(data, 0, ASF_HEADER_GUID.length);
	if (!ASF_HEADER_GUID.every((byte, index) => header[index] === byte)) {
		throw new AudioDecodingError('The selected .wma file is not an ASF/WMA container.');
	}
}

function assertOutputBudget(encodedBytes: number, samples: number): void {
	const duration = samples / TARGET_SAMPLE_RATE;
	assertDecodedMediaWithinBudget(
		encodedBytes,
		{
			length: samples,
			sampleRate: TARGET_SAMPLE_RATE,
			duration,
			numberOfChannels: 1
		},
		TARGET_SAMPLE_RATE
	);
}

function decodeBase64(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function getTransferables(value: unknown): Transferable[] {
	if (!value || typeof value !== 'object' || !('libavjsTransfer' in value)) {
		return [];
	}
	const transferables = (value as { libavjsTransfer?: unknown }).libavjsTransfer;
	return Array.isArray(transferables)
		? transferables.filter((item): item is Transferable => item instanceof ArrayBuffer)
		: [];
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (error && typeof error === 'object' && 'message' in error
		&& typeof (error as { message?: unknown }).message === 'string') {
		return (error as { message: string }).message;
	}
	return 'Unknown WMA decoder error';
}
