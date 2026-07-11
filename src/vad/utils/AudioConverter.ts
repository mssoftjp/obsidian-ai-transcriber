import { assertDecodedMediaWithinBudget, assertEncodedMediaWithinBudget } from '../../core/audio/MediaWorkBudget';
import { COOPERATIVE_BATCH_SIZE, isAbortError, throwIfAborted, yieldToEventLoop } from '../../core/utils/CooperativeTask';

export interface AudioDecodeOptions {
	signal?: AbortSignal;
	rangeStart?: number;
	rangeEnd?: number;
	targetSampleRate?: number;
}

export interface DecodedAudioData {
	audioData: Float32Array;
	sampleRate: number;
	rangeApplied: boolean;
	rangeStart: number;
	rangeEnd: number;
}

/**
 * 音声フォーマット変換ユーティリティ
 */
export class AudioConverter {
	private audioContext: AudioContext | null = null;

	constructor() {
		// AudioContextは必要時に初期化
	}

	/**
   * 音声ファイルをデコードしてFloat32Arrayに変換
   */
	async decodeAudioFile(
		audioBuffer: ArrayBuffer,
		fileExtension: string,
		options: AudioDecodeOptions = {}
	): Promise<DecodedAudioData> {
		const { signal } = options;
			try {
				throwIfAborted(signal);
				assertEncodedMediaWithinBudget(audioBuffer.byteLength);
				// AudioContextを初期化（遅延初期化）
				const audioContext = this.audioContext ?? new AudioContext();
				this.audioContext = audioContext;

				// AudioBufferにデコード
				const decodedAudio = await audioContext.decodeAudioData(
					audioBuffer.slice(0) // コピーを作成
			);
			throwIfAborted(signal);
			const sourceDuration = decodedAudio.duration;
			const rangeStart = Math.max(0, Math.min(options.rangeStart ?? 0, sourceDuration));
			const rangeEnd = Math.max(rangeStart, Math.min(options.rangeEnd ?? sourceDuration, sourceDuration));
			if (rangeEnd <= rangeStart) {
				throw new Error('Selected audio time range is empty');
			}
			const rangeApplied = rangeStart > 0 || rangeEnd < sourceDuration;
			const targetSampleRate = options.targetSampleRate ?? decodedAudio.sampleRate;
			assertDecodedMediaWithinBudget(
				audioBuffer.byteLength,
				decodedAudio,
				targetSampleRate,
				rangeApplied ? { workingDurationSeconds: rangeEnd - rangeStart } : {}
			);

			const startFrame = Math.floor(rangeStart * decodedAudio.sampleRate);
			const endFrame = Math.min(decodedAudio.length, Math.ceil(rangeEnd * decodedAudio.sampleRate));
			const monoAudio = await this.convertToMono(decodedAudio, startFrame, endFrame, signal);
			const audioData = await this.resample(monoAudio, decodedAudio.sampleRate, targetSampleRate, signal);

			return {
				audioData,
				sampleRate: targetSampleRate,
				rangeApplied,
				rangeStart,
				rangeEnd
			};
		} catch (error: unknown) {
			if (isAbortError(error, signal)) {
				throw error;
			}
			const errorMessage = this.formatUnknownError(error);
			throw new Error(
				`Failed to decode audio file (${fileExtension}): ${errorMessage}`
			);
		}
	}

	/**
   * Float32ArrayをWAVフォーマットにエンコード
   */
	async encodeToWAV(
		audioData: Float32Array,
		sampleRate: number,
		signal?: AbortSignal
	): Promise<ArrayBuffer> {
		throwIfAborted(signal);
		// WAVヘッダーのサイズ
		const headerSize = 44;
		const pcmByteLength = audioData.length * Int16Array.BYTES_PER_ELEMENT;
		const fileSize = headerSize + pcmByteLength;

		// ArrayBufferとDataViewを作成
		const buffer = new ArrayBuffer(fileSize);
		const view = new DataView(buffer);

		// WAVヘッダーを書き込み
		this.writeWAVHeader(view, pcmByteLength, sampleRate);

		let offset = headerSize;
		for (let index = 0; index < audioData.length; index++) {
			if (index > 0 && index % COOPERATIVE_BATCH_SIZE === 0) {
				await yieldToEventLoop(signal);
			}
			let value = Math.max(-1, Math.min(1, audioData[index] ?? 0));
			value = value < 0 ? value * 32768 : value * 32767;
			view.setInt16(offset, Math.round(value), true);
			offset += Int16Array.BYTES_PER_ELEMENT;
		}

		throwIfAborted(signal);
		return buffer;
	}

	/**
   * ステレオ/マルチチャンネルをモノラルに変換
   */
	private async convertToMono(
		audioBuffer: AudioBuffer,
		startFrame: number,
		endFrame: number,
		signal?: AbortSignal
	): Promise<Float32Array> {
		throwIfAborted(signal);
		const length = endFrame - startFrame;
		if (audioBuffer.numberOfChannels === 1) {
			const source = audioBuffer.getChannelData(0).subarray(startFrame, endFrame);
			const mono = new Float32Array(length);
			for (let offset = 0; offset < length; offset += COOPERATIVE_BATCH_SIZE) {
				const end = Math.min(length, offset + COOPERATIVE_BATCH_SIZE);
				mono.set(source.subarray(offset, end), offset);
				await yieldToEventLoop(signal);
			}
			return mono;
		}

		// 全チャンネルの平均を計算
		const mono = new Float32Array(length);
		const numberOfChannels = audioBuffer.numberOfChannels;

		for (let i = 0; i < length; i++) {
			if (i > 0 && i % COOPERATIVE_BATCH_SIZE === 0) {
				await yieldToEventLoop(signal);
			}
			let sum = 0;
			for (let channel = 0; channel < numberOfChannels; channel++) {
				const channelData = audioBuffer.getChannelData(channel);
				sum += channelData[startFrame + i] ?? 0;
			}
			mono[i] = sum / numberOfChannels;
		}

		throwIfAborted(signal);
		return mono;
	}

	private async resample(
		input: Float32Array,
		inputRate: number,
		outputRate: number,
		signal?: AbortSignal
	): Promise<Float32Array> {
		if (inputRate === outputRate) {
			return input;
		}
		const ratio = inputRate / outputRate;
		const output = new Float32Array(Math.floor(input.length / ratio));
		for (let index = 0; index < output.length; index++) {
			if (index > 0 && index % COOPERATIVE_BATCH_SIZE === 0) {
				await yieldToEventLoop(signal);
			}
			const sourceIndex = index * ratio;
			const lowerIndex = Math.floor(sourceIndex);
			const upperIndex = Math.min(lowerIndex + 1, input.length - 1);
			const fraction = sourceIndex - lowerIndex;
			const lower = input[lowerIndex] ?? 0;
			const upper = input[upperIndex] ?? lower;
			output[index] = lower * (1 - fraction) + upper * fraction;
		}
		throwIfAborted(signal);
		return output;
	}

	/**
   * WAVヘッダーを書き込み
   */
	private writeWAVHeader(
		view: DataView,
		dataSize: number,
		sampleRate: number
	): void {
		const channels = 1; // モノラル
		const bitsPerSample = 16;
		const bytesPerSample = bitsPerSample / 8;
		const blockAlign = channels * bytesPerSample;
		const byteRate = sampleRate * blockAlign;

		// "RIFF"
		view.setUint8(0, 0x52); // R
		view.setUint8(1, 0x49); // I
		view.setUint8(2, 0x46); // F
		view.setUint8(3, 0x46); // F

		// ファイルサイズ - 8
		view.setUint32(4, 36 + dataSize, true);

		// "WAVE"
		view.setUint8(8, 0x57);  // W
		view.setUint8(9, 0x41);  // A
		view.setUint8(10, 0x56); // V
		view.setUint8(11, 0x45); // E

		// "fmt "
		view.setUint8(12, 0x66); // f
		view.setUint8(13, 0x6D); // m
		view.setUint8(14, 0x74); // t
		view.setUint8(15, 0x20); // space

		// fmt チャンクサイズ
		view.setUint32(16, 16, true);

		// オーディオフォーマット (1 = PCM)
		view.setUint16(20, 1, true);

		// チャンネル数
		view.setUint16(22, channels, true);

		// サンプリングレート
		view.setUint32(24, sampleRate, true);

		// バイトレート
		view.setUint32(28, byteRate, true);

		// ブロックアライン
		view.setUint16(32, blockAlign, true);

		// ビット深度
		view.setUint16(34, bitsPerSample, true);

		// "data"
		view.setUint8(36, 0x64); // d
		view.setUint8(37, 0x61); // a
		view.setUint8(38, 0x74); // t
		view.setUint8(39, 0x61); // a

		// データチャンクサイズ
		view.setUint32(40, dataSize, true);
	}

	/**
   * クリーンアップ
   */
	cleanup(): void {
		if (this.audioContext) {
			const closePromise = this.audioContext.close();
			closePromise.catch((error) => {
				console.warn('Failed to close AudioContext in AudioConverter', error);
			});
			this.audioContext = null;
		}
	}

	private formatUnknownError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		try {
			const serialized: unknown = JSON.stringify(error);
			if (typeof serialized === 'string') {
				return serialized;
			}
			return 'Unknown error';
		} catch {
			return 'Unknown error';
		}
	}
}
