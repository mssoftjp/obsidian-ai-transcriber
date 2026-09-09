import { APITranscriptionModal } from '../../src/ui/ApiTranscriptionModal';
import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { readMediaDuration } from '../../src/infrastructure/audio/MediaDuration';
import { initializeTranslations } from '../../src/i18n';
import { Component } from './obsidian.mjs';

initializeTranslations({ en: {
  audioRange: { title: 'Audio range', audioDuration: 'Duration', enableSelection: 'Enable time range' },
  modal: { transcription: { duration: 'Duration: {duration}', startTime: 'Start', endTime: 'End' } }
} });
window.readMediaDuration = readMediaDuration;
window.openMedia = async (name, size, { failDecode = false, closeImmediately = false, metadataUnavailable = false } = {}) => {
  const resource = `/fixtures/${name}`;
  const calls = { reads: 0, estimates: [] };
  const app = { vault: {
    getResourcePath: () => metadataUnavailable ? '/missing.mp4' : resource,
    readBinary: async () => {
      calls.reads++;
      return (await fetch(resource)).arrayBuffer();
    }
  } };
  const file = { name, path: name, extension: name.split('.').pop(), stat: { size } };
  const modal = new APITranscriptionModal(app, new Component(), {}, file, structuredClone(DEFAULT_API_SETTINGS));
  modal.timeRangeEl = modal.contentEl.createDiv();
  // Cost rendering is unrelated, but verify the duration fed to it is accurate.
  modal.displayCostEstimate = async () => { calls.estimates.push(modal.audioDuration); };
  window.activeModal = modal;
  const originalDecode = AudioContext.prototype.decodeAudioData;
  if (failDecode) AudioContext.prototype.decodeAudioData = async () => { throw new Error('Unsupported audio codec'); };
  const pending = modal.loadTimeRangeControls(modal.contentEl.createDiv({ text: 'Loading' }));
  if (closeImmediately) modal.onClose();
  try { await pending; } finally { AudioContext.prototype.decodeAudioData = originalDecode; }
  return { ...calls, duration: modal.audioDuration, end: modal.endTimeInput?.value };
};

// Exercise both production decoding routes, including the embedded WMA worker.
window.decodeMediaRange = async (name, route) => {
  const { WebAudioEngine } = await import('../../src/infrastructure/audio/WebAudioEngine');
  const { AudioConverter } = await import('../../src/vad/utils/AudioConverter');
  const buffer = await (await fetch(`/fixtures/${name}`)).arrayBuffer();
  const extension = name.split('.').pop();
  const engine = new WebAudioEngine({ targetSampleRate: 16000, targetChannels: 1, targetBitDepth: 16, enableVAD: false });
  const converter = new AudioConverter();
  try {
    if (route === 'engine') {
      const decoded = await engine.process({ data: buffer, extension, fileName: name, size: buffer.byteLength }, { startTime: 1, endTime: 2 });
      return { duration: decoded.duration, samples: decoded.pcmData.length, peak: Math.max(...decoded.pcmData.map(Math.abs)) };
    }
    const decoded = await converter.decodeAudioFile(buffer, extension, { rangeStart: 1, rangeEnd: 2, targetSampleRate: 16000 });
    return { duration: decoded.audioData.length / decoded.sampleRate, samples: decoded.audioData.length, peak: Math.max(...decoded.audioData.map(Math.abs)) };
  } finally {
    await engine.cleanup();
    await converter.cleanup();
  }
};
