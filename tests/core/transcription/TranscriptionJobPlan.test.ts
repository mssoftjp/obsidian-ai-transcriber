interface JobPlanInput {
	model: string;
	vadMode: 'local' | 'disabled';
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
type CanFallBackToOriginalDirectUpload = (input: JobPlanInput) => boolean;

function loadPlanner(): {
	createPlan: CreateJobPlan;
	canFallBack: CanFallBackToOriginalDirectUpload;
} | null {
	try {
		const module = jest.requireActual('../../../src/core/transcription/TranscriptionJobPlan') as {
			createTranscriptionJobPlan?: CreateJobPlan;
			canFallBackToOriginalDirectUpload?: CanFallBackToOriginalDirectUpload;
		};
		if (!module.createTranscriptionJobPlan || !module.canFallBackToOriginalDirectUpload) {
			return null;
		}
		return {
			createPlan: module.createTranscriptionJobPlan,
			canFallBack: module.canFallBackToOriginalDirectUpload
		};
	} catch {
		return null;
	}
}

const baseInput: JobPlanInput = {
	model: 'gpt-4o-transcribe',
	vadMode: 'disabled',
	fileSizeBytes: 10 * 1024 * 1024,
	extension: 'mp3'
};

describe('createTranscriptionJobPlan', () => {
	it('uses direct upload for an eligible GPT Transcribe file', () => {
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(planner.createPlan({
			...baseInput,
			model: 'gpt-transcribe'
		})).toEqual({
			mode: 'direct',
			concurrency: 1
		});
	});

	it('uses direct upload without server chunking for an in-limit GPT-4o file without trimming', () => {
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(planner.createPlan(baseInput)).toEqual({
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
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(planner.createPlan(input)).toEqual({
			mode: 'client',
			concurrency: 1
		});
	});

	it('fails closed for an unknown model', () => {
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(() => planner.createPlan({
			...baseInput,
			model: 'unknown-model'
		})).toThrow(/Unknown model/);
	});

	it('keeps WMA on the client path because OpenAI does not accept it directly', () => {
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(planner.createPlan({ ...baseInput, extension: 'wma' })).toEqual({
			mode: 'client',
			concurrency: 1
		});
		expect(planner.canFallBack({ ...baseInput, extension: 'wma' })).toBe(false);
	});

	it('permits a pre-request M4A fallback that skips failed local preprocessing', () => {
		const planner = loadPlanner();
		expect(planner).not.toBeNull();
		if (!planner) {
			return;
		}

		expect(planner.canFallBack({
			...baseInput,
			extension: 'm4a',
			vadMode: 'local'
		})).toBe(true);
		expect(planner.canFallBack({
			...baseInput,
			extension: 'm4a',
			vadMode: 'local',
			startTime: 10
		})).toBe(false);
	});
});
