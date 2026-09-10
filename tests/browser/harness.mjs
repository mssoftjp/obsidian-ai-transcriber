import { APITranscriptionModal } from '../../src/ui/ApiTranscriptionModal';
import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { readMediaDuration } from '../../src/infrastructure/audio/MediaDuration';
import { initializeTranslations } from '../../src/i18n';
import en from '../../src/i18n/translations/en';
import { Component } from './obsidian.mjs';

initializeTranslations({ en });
window.readMediaDuration = readMediaDuration;
const createApp = (resource, calls, metadataUnavailable = false) => ({ vault: {
  getResourcePath: () => metadataUnavailable ? '/missing.mp4' : resource,
  readBinary: async () => {
    calls.reads++;
    return (await fetch(resource)).arrayBuffer();
  },
  getAllFolders: () => [{ path: '' }, { path: 'Transcriptions' }],
  getAbstractFileByPath: () => null,
  createFolder: async () => undefined
} });
window.openMedia = async (name, size, { failDecode = false, closeImmediately = false, metadataUnavailable = false } = {}) => {
  const resource = `/fixtures/${name}`;
  const calls = { reads: 0, estimates: [] };
  const app = createApp(resource, calls, metadataUnavailable);
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

window.openStartScreen = async (name, size) => {
  document.body.replaceChildren();
  const resource = `/fixtures/${name}`;
  const calls = { reads: 0, estimates: [], saved: 0, updates: 0 };
  const settings = structuredClone(DEFAULT_API_SETTINGS);
  const transcriber = {
    estimateCost: async () => ({ cost: 0.03, details: { minutes: 5 } }),
    updateSettings: () => { calls.updates++; },
    transcribe: async () => 'unused'
  };
  const file = { name, path: `Media/${name}`, extension: name.split('.').pop(), stat: { size } };
  const modal = new APITranscriptionModal(
    createApp(resource, calls),
    new Component(),
    transcriber,
    file,
    settings,
    undefined,
    async () => { calls.saved++; }
  );
  window.activeModal = modal;
  modal.onOpen();
  const deadline = performance.now() + 30000;
  while (!document.querySelector('.ait-time-field')) {
    if (performance.now() > deadline) throw new Error('Start screen did not finish loading');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { calls, settings };
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
