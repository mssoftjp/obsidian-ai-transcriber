# AI Transcriber for Obsidian

A powerful speech-to-text transcription plugin for Obsidian that uses OpenAI's GPT-4o and Whisper APIs.

## Features

- **File Transcription**: Transcribe existing audio files (MP3, WAV, WebM, M4A, etc.)
- **AI-Powered**: Uses OpenAI's models (GPT-4o and Whisper)
- **Post-Processing**: Optional transcript enhancement for better readability
- **Multi-Language**: Supports multiple languages with automatic detection

## Requirements

- Obsidian v17.0 or higher
- OpenAI API account with API key
- Internet connection for API calls

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Navigate to "Community plugins"
3. Click "Browse" and search for "AI Transcriber"
4. Click "Install"
5. Enable the plugin

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/mssoftjp/obsidian-ai-transcriber/releases)
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/ai-transcriber/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

## Setup

### Getting an OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API keys section
4. Create a new API key
5. Copy the key (you won't be able to see it again!)

**Important**: OpenAI API is a paid service. You will be charged based on usage. Please check [OpenAI's pricing page](https://openai.com/api/pricing) for current rates.

### Configuring the Plugin

1. Open Obsidian Settings → AI Transcriber
2. Enter your OpenAI API key
3. Choose your preferred transcription model:
   - **GPT-4o Transcribe**: Highest quality transcription (recommended)
   - **GPT-4o Mini Transcribe**: Fast and cost-effective
   - **Whisper**: Traditional transcription model
4. Configure other settings as needed

## Usage

### Recording Audio

### Transcribing Audio Files

1. Use the command palette: "AI Transcriber: Transcribe audio file"
2. Select an audio file from your device
3. Choose transcription settings
4. Wait for processing
5. The transcription text will be saved to your specified folder

## Settings

### API Settings
- **API Key**: Your OpenAI API key (stored securely)
- **Model Selection**: Choose between GPT-4o Transcribe, GPT-4o Mini Transcribe, and Whisper
- **Language**: Auto-detect or specify a language

### Output Settings
- **Save Location**: Folder for transcribed notes
- **Post-Processing**: Enable/disable transcript enhancement

### Dictionary Settings
- **Custom Dictionary**: Improve transcription accuracy with personalized corrections
  - Add commonly mistranscribed words or proper nouns
  - Support for multiple languages (Japanese, English, Chinese, Korean)
  - Categories: Names, places, technical terms, etc.
  - Context-aware intelligent correction


## Network Usage Disclosure

This plugin requires an internet connection and communicates with the following services:

- **OpenAI API** (api.openai.com): Used for audio transcription and text processing
  - Audio data is sent to OpenAI for transcription
  - API key is sent with each request for authentication
  - No data is stored permanently by the plugin beyond the transcribed text

## Privacy and Security

- Your OpenAI API key is stored securely using Obsidian's built-in encryption
- Audio recordings are processed locally before being sent to OpenAI
- No telemetry or usage data is collected by this plugin
- Transcribed text is saved only to your local vault

## Troubleshooting

### Common Issues

**"Invalid API Key" error**
- Verify your API key is correct and active
- Check if you have sufficient credits in your OpenAI account

**"Recording failed" error**
- Ensure your browser has microphone permissions
- Try using a different audio format in settings

**Transcription is cut off or incomplete**
- Large audio files may hit token limits
- Try using shorter recordings or split long files

**Poor transcription quality**
- Ensure good audio quality (minimal background noise)
- Speak clearly and at a moderate pace
- Try using GPT-4o Transcribe model for better accuracy

### Getting Help

If you encounter issues:
1. Check the console for error messages (Ctrl/Cmd + Shift + I)
2. Disable other plugins to test for conflicts
3. Report issues on [GitHub](https://github.com/mssoftjp/obsidian-ai-transcriber/issues)

## Support

If you find this plugin helpful, consider:
- Starring the repository on [GitHub](https://github.com/mssoftjp/obsidian-ai-transcriber)
- Reporting bugs or suggesting features
- Contributing to documentation

## License

This plugin is licensed under the MIT License. See [LICENSE](LICENSE) for details.

### Third-Party Software

This plugin includes third-party software with their own licenses. See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for details.

Notable third-party components:
- **WebRTC VAD (@echogarden/fvad-wasm)**: BSD-3-Clause License - Used for voice activity detection

## Acknowledgments

- The wonderful Obsidian team for providing an excellent platform
- OpenAI for providing powerful AI models

### Open Source Libraries

- **WebRTC VAD** - Google's voice activity detection algorithm
- **@echogarden/fvad-wasm** - WASM port of WebRTC VAD
- **@noble/hashes** - Cryptographic hash functions by Paul Miller

### Development Tools

- **Node.js** - JavaScript runtime
- **TypeScript** - Type-safe JavaScript
- **esbuild** - Fast JavaScript bundler
- **Jest** - Testing framework

---

# Obsidian用AI Transcriber

OpenAIのGPT-4oとWhisper APIを使用したObsidian用の強力な音声認識テキスト変換プラグインです。

## 機能

- **ファイル文字起こし**: 既存の音声ファイル（MP3、WAV、WebM、M4Aなど）を文字起こし
- **AI駆動**: OpenAIのモデル（GPT-4oとWhisper）を使用
- **後処理**: 読みやすさを向上させるオプションのtranscript強化機能
- **多言語対応**: 自動検出による複数言語のサポート

## 必要条件

- Obsidian v17.0以上
- API キーを持つOpenAI APIアカウント
- API呼び出し用のインターネット接続

## インストール

### Obsidian Community Pluginsから

1. Obsidianの設定を開く
2. 「Community plugins」に移動
3. 「閲覧」をクリックして「AI Transcriber」を検索
4. 「インストール」をクリック
5. プラグインを有効化

### 手動インストール

1. [GitHubリリースページ](https://github.com/mssoftjp/obsidian-ai-transcriber/releases)から最新リリースをダウンロード
2. ファイルをvaultのプラグインフォルダに展開: `<vault>/.obsidian/plugins/ai-transcriber/`
3. Obsidianを再読み込み
4. 設定 → Community pluginsでプラグインを有効化

## セットアップ

### OpenAI APIキーの取得

1. [OpenAI Platform](https://platform.openai.com/)にアクセス
2. アカウントにサインアップまたはログイン
3. APIキーセクションに移動
4. 新しいAPIキーを作成
5. キーをコピー（再度表示されません！）

**重要**: OpenAI APIは有料サービスです。使用量に基づいて課金されます。現在の料金は[OpenAIの価格ページ](https://openai.com/api/pricing)をご確認ください。

### プラグインの設定

1. Obsidian設定 → AI Transcriberを開く
2. OpenAI APIキーを入力
3. 希望の文字起こしモデルを選択:
   - **GPT-4o Transcribe**: 最高品質の文字起こし（推奨）
   - **GPT-4o Mini Transcribe**: 高速でコスト効率が良い
   - **Whisper**: 従来の文字起こしモデル
4. 必要に応じて他の設定を構成

## 使用方法

### 音声ファイルの文字起こし

1. コマンドパレット: 「AI Transcriber: 音声ファイルを文字起こし」を使用
2. デバイスから音声ファイルを選択
3. 文字起こし設定を選択
4. 処理を待つ
5. 文字起こしテキストが指定されたフォルダに保存されます

## 設定

### API設定
- **APIキー**: OpenAI APIキー（安全に保存）
- **モデル選択**: GPT-4o Transcribe、GPT-4o Mini Transcribe、Whisperから選択
- **言語**: 自動検出または言語を指定

### 出力設定
- **保存場所**: 文字起こしノートのフォルダ
- **後処理**: transcript強化の有効/無効

### 辞書設定
- **カスタム辞書**: 個人用の補正辞書で文字起こし精度を向上
  - よく誤認識される単語や固有名詞を登録
  - 複数言語対応（日本語、英語、中国語、韓国語）
  - カテゴリ分類：人名、地名、専門用語など
  - 文脈を考慮した賢い補正

## ネットワーク使用の開示

このプラグインはインターネット接続が必要で、以下のサービスと通信します：

- **OpenAI API** (api.openai.com): 音声の文字起こしとテキスト処理に使用
  - 音声データは文字起こしのためOpenAIに送信されます
  - APIキーは認証のため各リクエストと共に送信されます
  - プラグインによって文字起こしされたテキスト以外のデータは永続的に保存されません

## プライバシーとセキュリティ

- OpenAI APIキーはObsidianの組み込み暗号化を使用して安全に保存されます
- 音声録音はOpenAIに送信される前にローカルで処理されます
- このプラグインによるテレメトリーや使用データの収集はありません
- 文字起こしされたテキストはローカルのvaultにのみ保存されます

## トラブルシューティング

### よくある問題

**「無効なAPIキー」エラー**
- APIキーが正しく、アクティブであることを確認
- OpenAIアカウントに十分なクレジットがあるか確認

**「録音に失敗しました」エラー**
- ブラウザにマイクの権限があることを確認
- 設定で別の音声形式を試す

**文字起こしが途切れるまたは不完全**
- 大きな音声ファイルはトークン制限に達する可能性があります
- より短い録音を使用するか、長いファイルを分割してください

**文字起こし品質が悪い**
- 良好な音質を確保（背景ノイズを最小限に）
- はっきりと、適度なペースで話す
- より高い精度のためGPT-4o Transcribeモデルを試す

### ヘルプを得る

問題が発生した場合：
1. エラーメッセージのコンソールを確認（Ctrl/Cmd + Shift + I）
2. 競合をテストするため他のプラグインを無効化
3. [GitHub](https://github.com/mssoftjp/obsidian-ai-transcriber/issues)で問題を報告

## サポート

このプラグインが役立つと思われた場合：
- [GitHub](https://github.com/mssoftjp/obsidian-ai-transcriber)でリポジトリにスターを付ける
- バグの報告や機能の提案
- ドキュメントへの貢献

## ライセンス

このプラグインはMITライセンスの下でライセンスされています。詳細は[LICENSE](LICENSE)をご覧ください。

### サードパーティソフトウェア

このプラグインには独自のライセンスを持つサードパーティソフトウェアが含まれています。詳細は[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)をご覧ください。

主なサードパーティコンポーネント：
- **WebRTC VAD (@echogarden/fvad-wasm)**: - 音声区間検出に使用

## 謝辞

- 素晴らしいプラットフォームを提供してくれたObsidianチーム
- 強力なAIモデルを提供してくれたOpenAI

### オープンソースライブラリ

- **WebRTC VAD** - Googleの音声区間検出アルゴリズム
- **@echogarden/fvad-wasm** - WebRTC VADのWASMポート
- **@noble/hashes** - Paul Miller氏による暗号化ハッシュ関数

### 開発ツール

- **Node.js** - JavaScriptランタイム
- **TypeScript** - 型安全なJavaScript
- **esbuild** - 高速JavaScriptバンドラー
- **Jest** - テスティングフレームワーク
