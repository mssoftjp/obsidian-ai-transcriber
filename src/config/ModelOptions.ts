import { MODEL_NAMES } from './constants';

import type { TranscriptionModel } from '../ApiSettings';


export interface ModelOption {
  /**
   * Unique dropdown value
   */
  value: string;
  /**
   * Underlying model name
   */
  model: TranscriptionModel;
}

export const MODEL_OPTIONS: ModelOption[] = [
	{
		value: MODEL_NAMES.GPT4O,
		model: MODEL_NAMES.GPT4O as TranscriptionModel
	},
	{
		value: MODEL_NAMES.GPT4O_MINI,
		model: MODEL_NAMES.GPT4O_MINI as TranscriptionModel
	},
	{
		value: MODEL_NAMES.WHISPER,
		model: MODEL_NAMES.WHISPER as TranscriptionModel
	},
	{
		value: MODEL_NAMES.WHISPER_TS,
		model: MODEL_NAMES.WHISPER_TS as TranscriptionModel
	}
];

export function getModelOption(value: string): ModelOption | undefined {
	return MODEL_OPTIONS.find(option => option.value === value);
}
