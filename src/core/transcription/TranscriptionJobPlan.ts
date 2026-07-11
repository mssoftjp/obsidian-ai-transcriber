import type { VADMode } from '../../ApiSettings';

const DIRECT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const DIRECT_UPLOAD_EXTENSIONS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']);

export interface TranscriptionJobPlanInput {
	model: string;
	vadMode: VADMode;
	fileSizeBytes: number;
	extension: string;
	startTime?: number;
	endTime?: number;
}

export interface TranscriptionJobPlan {
	mode: 'direct' | 'client';
	chunkingStrategy?: 'auto';
	concurrency: 1;
}

export function createTranscriptionJobPlan(input: TranscriptionJobPlanInput): TranscriptionJobPlan {
	const isGPT4o = input.model === 'gpt-4o-transcribe' || input.model === 'gpt-4o-mini-transcribe';
	const usesServerChunking = isGPT4o && input.vadMode === 'server';
	const hasTimeRange = input.startTime !== undefined || input.endTime !== undefined;
	const extension = input.extension.toLowerCase();
	const canUploadDirectly = usesServerChunking
		&& !hasTimeRange
		&& input.fileSizeBytes <= DIRECT_UPLOAD_LIMIT_BYTES
		&& DIRECT_UPLOAD_EXTENSIONS.has(extension);

	return {
		mode: canUploadDirectly ? 'direct' : 'client',
		...(usesServerChunking ? { chunkingStrategy: 'auto' as const } : {}),
		concurrency: 1
	};
}
