import { TRANSCRIPTION_MODEL_PROFILES } from './TranscriptionModelProfiles';

import type { TranscriptionModel } from './TranscriptionModelProfiles';

export interface ModelOption {
  /**
   * Unique dropdown value
   */
  value: TranscriptionModel;
  /**
   * Underlying model name
   */
  model: TranscriptionModel;
}

export const MODEL_OPTIONS = TRANSCRIPTION_MODEL_PROFILES.map(profile => ({
	value: profile.id,
	model: profile.id
})) satisfies ModelOption[];

export function getModelOption(value: string): ModelOption | undefined {
	return MODEL_OPTIONS.find(option => option.value === value);
}
