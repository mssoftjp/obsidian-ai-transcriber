#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: npm run test:long-form:generate -- [output.wav]"
  echo "Generates synthetic Japanese audio. Default: /private/tmp/ai-transcriber-gpt4o-long-form.wav"
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: this generator requires the macOS 'say' command." >&2
  exit 1
fi

for command_name in say ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: required command not found: $command_name" >&2
    exit 1
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
fixture="$repo_root/tests/fixtures/long-form-gpt4o-ja.txt"
output_wav="${1:-/private/tmp/ai-transcriber-gpt4o-long-form.wav}"
output_dir="$(dirname "$output_wav")"
output_name="$(basename "$output_wav" .wav)"
intermediate_aiff="$output_dir/$output_name.aiff"
temporary_wav="$output_dir/$output_name.tmp.wav"

cleanup() {
  rm -f "$intermediate_aiff" "$temporary_wav"
}
trap cleanup EXIT

mkdir -p "$output_dir"
say -v Kyoko -r 95 -f "$fixture" -o "$intermediate_aiff"
ffmpeg -hide_banner -loglevel error -y -i "$intermediate_aiff" \
  -ar 16000 -ac 1 -c:a pcm_s16le "$temporary_wav"

duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$temporary_wav")"
size_bytes="$(stat -f %z "$temporary_wav")"
if ! awk -v duration="$duration" 'BEGIN { exit !(duration ~ /^[0-9]+([.][0-9]+)?$/ && duration + 0 >= 360) }'; then
  echo "Error: generated audio is shorter than 360 seconds (${duration}s)." >&2
  exit 1
fi

mv "$temporary_wav" "$output_wav"

echo "Generated: $output_wav"
echo "Duration: ${duration}s"
echo "Size: ${size_bytes} bytes"
echo "The audio is synthetic and remains outside the repository by default."
