# WMA Standard decoder build

These generated files form the local, single-threaded WMA Standard decoder:

- `wma-standard.worker.txt`: libav.js worker and FFmpeg JavaScript bindings
- `wma-standard.wasm.bin`: WebAssembly implementation

Only ASF demuxing, `wmav1`/`wmav2` decoding, audio filters, downmixing, and
16 kHz resampling are enabled. The runtime rejects any other WMA codec.

## Source and toolchain

- libav.js 6.10.9, commit `c80e885c3461f7bb7ea565c9631b34243ae0dbf1`
  - https://github.com/Yahweasel/libav.js/tree/c80e885c3461f7bb7ea565c9631b34243ae0dbf1
- FFmpeg 9.0
  - https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz
  - SHA-256: `7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52`
- Emscripten SDK 6.0.5, commit `1db513782be24469589d7cb8a1f1834e9a33f271`

The libav.js source archive used for this build had SHA-256
`ad1932a86ef0bcc87b1e71df34b735f8b3cda0022ffe04b95890adfda24cd186`
and is byte-for-byte equivalent to the Git commit above after extraction.

## Rebuild

1. Check out the exact libav.js commit and activate Emscripten 6.0.5.
2. Copy this directory's `build-config` directory to
   `configs/configs/wma-standard` in the libav.js checkout.
3. Add `--ar=emar --nm=emnm` immediately after `--cc=emcc --cxx=em++` in
   `mk/ffmpeg.mk` and `mk/ffmpeg.mk.m4`. This is a build-tool selection change;
   no FFmpeg or libav.js source logic is modified.
4. Run `npm ci` and then
   `make dist/libav-6.10.9.0-wma-standard.wasm.js`.
5. Copy the generated `.wasm.js` file (which includes libav.js's worker wrapper)
   to `wma-standard.worker.txt`, and copy the generated `.wasm.wasm` file to
   `wma-standard.wasm.bin`.

Expected generated artifact hashes:

- worker: `9cd59199cfa5e41426c99f230c16e47dbfa2cb9168b11dd9777ab7b549ff8213`
- wasm: `97c4ede4124184e0bca04da6f1e74e9952f0643f64dd9ab71edf5f714eb2bd39`

The generated worker begins with the applicable copyright notices and the
complete LGPL 2.1 license. Do not strip that header.
