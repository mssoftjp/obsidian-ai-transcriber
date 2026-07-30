import { GPT4oClient } from '../../../../src/infrastructure/api/openai/GPT4oClient';

describe('GPT4oClient direct file transcription', () => {
	it('serializes GPT Transcribe languages as repeated languages[] fields', async () => {
		const client = new GPT4oClient('test-key', 'gpt-transcribe');
		const post = jest.fn().mockResolvedValue({
			text: '<TRANSCRIPT>こんにちは</TRANSCRIPT>',
			languages: ['ja']
		});
		(client as unknown as { post: jest.Mock }).post = post;

		await client.transcribeFile(
			new Uint8Array([1, 2, 3]).buffer,
			'meeting.mp3',
			'audio/mpeg',
			{ language: 'ja' }
		);

		const formData = post.mock.calls[0]?.[1] as FormData;
		expect(formData.get('model')).toBe('gpt-transcribe');
		expect(formData.getAll('languages[]')).toEqual(['ja']);
		expect(formData.get('languages')).toBeNull();
		expect(formData.get('language')).toBeNull();
		expect(formData.get('reasoning_effort')).toBeNull();
		expect(formData.get('chunking_strategy')).toBeNull();
	});

	it('omits both language fields for GPT Transcribe auto-detection', async () => {
		const client = new GPT4oClient('test-key', 'gpt-transcribe');
		const post = jest.fn().mockResolvedValue({ text: 'hello', languages: ['en'] });
		(client as unknown as { post: jest.Mock }).post = post;

		await client.transcribeFile(
			new Uint8Array([1]).buffer,
			'meeting.mp3',
			'audio/mpeg',
			{ language: 'auto' }
		);

		const formData = post.mock.calls[0]?.[1] as FormData;
		expect(formData.getAll('languages[]')).toEqual([]);
		expect(formData.get('language')).toBeNull();
	});

	it('rejects Whisper and unknown models before a request can be sent', () => {
		expect(() => new GPT4oClient('test-key', 'whisper-1'))
			.toThrow(/does not use the OpenAI file transcription workflow/);
		expect(() => new GPT4oClient('test-key', 'unknown-model'))
			.toThrow(/Unknown model/);
	});

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
