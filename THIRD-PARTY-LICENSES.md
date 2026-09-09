# Third-Party Licenses

This project includes the following third-party software:

## @echogarden/fvad-wasm

WebRTC VAD library, compiled to WASM.

**Repository:** https://github.com/echogarden-project/fvad-wasm  
**Original Project:** https://github.com/dpirch/libfvad

**License:** BSD-3-Clause

```
Copyright (c) 2011, The WebRTC project authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in
    the documentation and/or other materials provided with the
    distribution.

  * Neither the name of Google nor the names of its contributors may
    be used to endorse or promote products derived from this software
    without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Obsidian API

**Repository:** https://github.com/obsidianmd/obsidian-api  
**License:** MIT

Copyright (c) Obsidian

## libav.js and FFmpeg (WMA Standard decoder)

The plugin embeds a single-threaded WebAssembly build used only to demux ASF,
decode `wmav1`/`wmav2`, downmix, and resample audio. It does not include WMA
Pro, WMA Lossless, WMA Voice, encoders, video codecs, or network protocols.

- libav.js 6.10.9 source commit: https://github.com/Yahweasel/libav.js/tree/c80e885c3461f7bb7ea565c9631b34243ae0dbf1
- FFmpeg 9.0 source: https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz
- libav.js license: LGPL-compatible compilation; per-file notices are retained in the generated worker
- FFmpeg license for this configuration: GNU Lesser General Public License, version 2.1 or later
- Local build recipe, configuration, source hashes, and binary hashes: `src/vendor/wma-standard/README.md`

The generated worker contains the complete applicable license notices and
LGPL 2.1 text. The corresponding sources and the local configuration change
needed to reproduce the binaries are linked and documented above.

The WMA JavaScript runtime is compiled for Web Workers only. The upstream
Node.js filesystem and crypto branches are omitted at compile time. The version
line in its generated header is normalized; copyright and license notices are
retained in full.

## Development Dependencies

The following are used only during development and are not included in the distributed plugin:

- TypeScript - Apache-2.0
- ESBuild - MIT
- ESLint - MIT
- Jest - MIT
- Various @types packages - MIT

For a complete list of dependencies, see package.json.
