import { getTranscriptionModelProfile } from '../../config/TranscriptionModelProfiles';

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
	concurrency: 1;
}

export function createTranscriptionJobPlan(input: TranscriptionJobPlanInput): TranscriptionJobPlan {
	const profile = getTranscriptionModelProfile(input.model);
	const hasTimeRange = input.startTime !== undefined || input.endTime !== undefined;
	const extension = input.extension.toLowerCase();
	const canUploadDirectly = profile.capabilities.originalDirectUpload
		&& input.vadMode === 'disabled'
		&& !hasTimeRange
		&& input.fileSizeBytes <= DIRECT_UPLOAD_LIMIT_BYTES
		&& DIRECT_UPLOAD_EXTENSIONS.has(extension);

	return {
		mode: canUploadDirectly ? 'direct' : 'client',
		concurrency: 1
	};
}
