import { WhisperClient } from '../../../../src/infrastructure/api/openai/WhisperClient';

describe('WhisperClient chunk transcription', () => {
	it('uploads encoded chunks with their declared extension and MIME type', async () => {
		const client = new WhisperClient('test-key');
		const post = jest.fn().mockResolvedValue({ text: 'hello' });
		(client as unknown as { post: jest.Mock }).post = post;

		await client.transcribe({
			id: 2,
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
		expect(uploadedFile.name).toBe('chunk_2.webm');
		expect(uploadedFile.type).toBe('audio/webm');
	});
});
