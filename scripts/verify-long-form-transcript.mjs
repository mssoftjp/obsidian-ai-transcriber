#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPECTED_IDS = Array.from({ length: 20 }, (_, index) => String(1001 + index));

export function verifyTranscript(text) {
  const failures = [];
  let previousPosition = -1;

  for (const id of EXPECTED_IDS) {
    const position = text.indexOf(id);
    if (position === -1) {
      failures.push(`識別番号 ${id} がありません。`);
    } else if (position <= previousPosition) {
      failures.push(`識別番号 ${id} の順序が正しくありません。`);
    } else {
      previousPosition = position;
    }
  }

  if (!text.includes('シリウス')) {
    failures.push('最後の合言葉「シリウス」がありません。');
  }
  if (!text.includes('これで合成音声を終了します')) {
    failures.push('最終終了文がありません。');
  }
  if (text.includes('【欠損:')) {
    failures.push('欠損プレースホルダーが残っています。');
  }

  return failures;
}

export function verifyHistory(state, inputName) {
  const items = state?.history?.items;
  if (!Array.isArray(items)) {
    return ['履歴データに history.items 配列がありません。'];
  }

  const task = items.find((item) => item?.inputFileName === inputName);
  if (!task) {
    return [`履歴に ${inputName} のタスクがありません。`];
  }

  const failures = [];
  if (task.status !== 'completed') {
    failures.push(`履歴の状態が completed ではありません: ${String(task.status)}`);
  }
  if (!Number.isInteger(task.totalChunks) || task.totalChunks < 2) {
    failures.push(`複数チャンクになっていません: ${String(task.totalChunks)}`);
  }
  if (task.completedChunks !== task.totalChunks) {
    failures.push(`完了チャンク数が一致しません: ${String(task.completedChunks)}/${String(task.totalChunks)}`);
  }
  return failures;
}

function usage() {
  console.log('Usage: npm run test:long-form:verify -- <transcript.md> [--history <data.json>] [--input-name <audio.wav>]');
}

async function main(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    return args.length === 0 ? 1 : 0;
  }

  const transcriptPath = args[0];
  let historyPath;
  let inputName = 'ai-transcriber-gpt4o-long-form.wav';

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--history') {
      historyPath = args[index + 1];
      index += 1;
    } else if (argument === '--input-name') {
      inputName = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if ((args.includes('--history') && !historyPath) || (args.includes('--input-name') && !inputName)) {
    throw new Error('An option value is missing.');
  }

  const transcript = await readFile(transcriptPath, 'utf8');
  const failures = verifyTranscript(transcript);
  if (historyPath) {
    const history = JSON.parse(await readFile(historyPath, 'utf8'));
    failures.push(...verifyHistory(history, inputName));
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure}`);
    }
    return 1;
  }

  console.log(`PASS: 20個の識別番号、順序、終端マーカー${historyPath ? '、複数チャンク履歴' : ''}を確認しました。`);
  return 0;
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
