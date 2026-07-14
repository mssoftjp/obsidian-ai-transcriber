interface JobPlanInput {
	model: string;
	vadMode: 'server' | 'local' | 'disabled';
	fileSizeBytes: number;
	extension: string;
	startTime?: number;
	endTime?: number;
}

interface JobPlan {
	mode: 'direct' | 'client';
	concurrency: 1;
}

type CreateJobPlan = (input: JobPlanInput) => JobPlan;

function loadPlanner(): CreateJobPlan | null {
	try {
		const module = jest.requireActual('../../../src/core/transcription/TranscriptionJobPlan') as {
			createTranscriptionJobPlan?: CreateJobPlan;
		};
		return module.createTranscriptionJobPlan ?? null;
	} catch {
		return null;
	}
}

const baseInput: JobPlanInput = {
	model: 'gpt-4o-transcribe',
	vadMode: 'server',
	fileSizeBytes: 10 * 1024 * 1024,
	extension: 'mp3'
};

describe('createTranscriptionJobPlan', () => {
	it('uses direct upload without server chunking for an in-limit GPT-4o file without trimming', () => {
		const createPlan = loadPlanner();
		expect(createPlan).not.toBeNull();
		if (!createPlan) {
			return;
		}

		expect(createPlan(baseInput)).toEqual({
			mode: 'direct',
			concurrency: 1
		});
	});

	it.each([
		{ ...baseInput, vadMode: 'local' as const },
		{ ...baseInput, startTime: 30 },
		{ ...baseInput, fileSizeBytes: 26 * 1024 * 1024 },
		{ ...baseInput, model: 'whisper-1' },
		{ ...baseInput, extension: 'flac' }
	])('uses client processing without server chunking when direct upload is not safe', (input) => {
		const createPlan = loadPlanner();
		expect(createPlan).not.toBeNull();
		if (!createPlan) {
			return;
		}

		expect(createPlan(input)).toEqual({
			mode: 'client',
			concurrency: 1
		});
	});
});
