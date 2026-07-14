import { GPT4oClient } from '../../../../src/infrastructure/api/openai/GPT4oClient';

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

	it('uploads the original file without server chunking', async () => {
		const client = new GPT4oClient('test-key', 'gpt-4o-transcribe');
		const post = jest.fn().mockResolvedValue({ text: '<TRANSCRIPT>hello</TRANSCRIPT>' });
		(client as unknown as { post: jest.Mock }).post = post;

		const result = await client.transcribeFile(
			new Uint8Array([1, 2, 3]).buffer,
			'meeting.mp3',
			'audio/mpeg',
			{ language: 'auto' }
		);

		const formData = post.mock.calls[0]?.[1] as FormData;
		const uploadedFile = formData.get('file') as File;
		expect(uploadedFile.name).toBe('meeting.mp3');
		expect(uploadedFile.type).toBe('audio/mpeg');
		expect(formData.get('chunking_strategy')).toBeNull();
		expect(result).toMatchObject({ success: true, text: 'hello' });
	});
});
