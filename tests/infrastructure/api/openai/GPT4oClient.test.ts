import { GPT4oClient } from '../../../../src/infrastructure/api/openai/GPT4oClient';

import type { TranscriptionOptions, TranscriptionResult } from '../../../../src/core/transcription/TranscriptionTypes';

interface DirectFileClient {
	transcribeFile?: (
		data: ArrayBuffer,
		fileName: string,
		mimeType: string,
		options: TranscriptionOptions,
		chunkingStrategy?: 'auto'
	) => Promise<TranscriptionResult>;
}

describe('GPT4oClient direct file transcription', () => {
	it('uploads encoded chunks with their declared extension and MIME type', async () => {
		const client = new GPT4oClient('test-key', 'gpt-4o-mini-transcribe');
		const post = jest.fn().mockResolvedValue({ text: '<TRANSCRIPT>hello</TRANSCRIPT>' });
		(client as unknown as { post: jest.Mock }).post = post;

		await client.transcribe({
			id: 3,
			data: Uint8Array.of(1, 2, 3).buffer,
			startTime: 0,
			endTime: 20,
			hasOverlap: false,
			overlapDuration: 0,
			fileExtension: 'webm',
			mimeType: 'audio/webm',
			codec: 'opus'
		}, { language: 'ja' });

		const formData = post.mock.calls[0]?.[1] as FormData;
		const uploadedFile = formData.get('file') as File;
		expect(uploadedFile.name).toBe('chunk_3.webm');
		expect(uploadedFile.type).toBe('audio/webm');
		expect(formData.get('chunking_strategy')).toBeNull();
	});

	it('uploads the original file without honoring a legacy server chunking argument', async () => {
		const client = new GPT4oClient('test-key', 'gpt-4o-transcribe');
		const post = jest.fn().mockResolvedValue({ text: '<TRANSCRIPT>hello</TRANSCRIPT>' });
		(client as unknown as { post: jest.Mock }).post = post;
		const directClient = client as unknown as DirectFileClient;

		expect(directClient.transcribeFile).toEqual(expect.any(Function));
		if (!directClient.transcribeFile) {
			return;
		}

		const result = await directClient.transcribeFile.call(
			client,
			new Uint8Array([1, 2, 3]).buffer,
			'meeting.mp3',
			'audio/mpeg',
			{ language: 'auto' },
			'auto'
		);

		const formData = post.mock.calls[0]?.[1] as FormData;
		const uploadedFile = formData.get('file') as File;
		expect(uploadedFile.name).toBe('meeting.mp3');
		expect(uploadedFile.type).toBe('audio/mpeg');
		expect(formData.get('chunking_strategy')).toBeNull();
		expect(result).toMatchObject({ success: true, text: 'hello' });
	});
});
