import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyHistory, verifyTranscript } from './verify-long-form-transcript.mjs';

const completeTranscript = [
  ...Array.from({ length: 20 }, (_, index) => `識別番号は${1001 + index}です。`),
  '最後の合言葉はシリウスです。',
  'これで合成音声を終了します。'
].join('\n');

test('accepts a complete ordered long-form transcript', () => {
  assert.deepEqual(verifyTranscript(completeTranscript), []);
});

test('detects missing identifiers and truncation', () => {
  const failures = verifyTranscript(completeTranscript.replace('識別番号は1013です。', ''));
  assert.ok(failures.some((failure) => failure.includes('1013')));
});

test('detects a missing-placeholder marker', () => {
  const failures = verifyTranscript(`${completeTranscript}\n【欠損: 120.0秒】`);
  assert.ok(failures.some((failure) => failure.includes('欠損プレースホルダー')));
});

test('accepts a completed multi-chunk history item', () => {
  const state = {
    history: {
      items: [{
        inputFileName: 'sample.wav',
        status: 'completed',
        totalChunks: 3,
        completedChunks: 3
      }]
    }
  };
  assert.deepEqual(verifyHistory(state, 'sample.wav'), []);
});

test('detects incomplete or single-chunk history', () => {
  const state = {
    history: {
      items: [{
        inputFileName: 'sample.wav',
        status: 'partial',
        totalChunks: 1,
        completedChunks: 0
      }]
    }
  };
  assert.equal(verifyHistory(state, 'sample.wav').length, 3);
});
