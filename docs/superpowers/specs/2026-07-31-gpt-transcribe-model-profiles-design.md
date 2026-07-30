# GPT Transcribe追加と文字起こしモデルプロファイル一元化

## Status

2026-07-31承認済み。テスト駆動で実装する。

本書は実装・ローカル検証までを対象とし、バージョン更新、リリース、外部公開、`git push` は許可しない。

## 決定概要

- 録音済みファイル向けの選択肢として `gpt-transcribe` を追加する。
- 新規設定、モデル値が欠落した設定、不正なモデル値の復旧先では `gpt-transcribe` を既定にする。既存の有効な保存済みモデル選択は変更しない。
- 選択可能なモデルのID、表示、料金、処理経路、APIの言語指定方式、処理 preset、クリーニング preset、タイムスタンプ、直接アップロード可否を、単一の読み取り専用プロファイル配列に集約する。
- `gpt-transcribe` は既存の高精度側の処理・クリーニング preset を再利用し、根拠のない専用閾値は作らない。
- `gpt-transcribe` では単数の `language` を送らず、既存の単一言語設定を1要素の `languages[]` に変換する。自動判定時は両方とも送らない。
- 未知のモデルを GPT-4o Mini に暗黙変換する現在の経路を廃止する。保存データの正規化時だけ既定モデルへ安全に戻し、実行時の未知モデルは明示的なエラーにする。
- `keywords`、複数言語選択UI、ファイルストリーミング、Realtime、`gpt-live-transcribe` は今回追加しない。

## OpenAI公式ドキュメントの確認結果

2026-07-31時点で以下を確認した。

- [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text) は、録音済み音声の文字起こしでは `gpt-transcribe` から始めることを推奨している。
- ファイル文字起こしは従来と同じ `POST /v1/audio/transcriptions` を使用する。
- ファイル上限は25 MBで、対応形式は `mp3`、`mp4`、`mpeg`、`mpga`、`m4a`、`wav`、`webm`。
- `gpt-transcribe` は単数の `language` ではなく `languages` 配列を使用し、両方を同時に送ってはいけない。
- multipart formでは配列要素を `languages[]` として繰り返して送る公式例が示されている。
- `prompt` は録音の文脈、`keywords` は音声に現れると期待する語、`languages` は入力言語候補に使う。
- `keywords` は発話されていない語の混入を招く可能性があり、導入時には効果検証が必要。
- 通常の応答は `text` と検出言語の `languages` を含む。確信を持って言語判定できない場合は空配列になる。
- [Migration guide](https://developers.openai.com/cookbook/examples/migrating_from_whisper_to_gpt_transcribe) は、完了済みファイルには `gpt-transcribe`、継続的な低遅延音声には `gpt-live-transcribe` を使い分けている。
- [Pricing](https://developers.openai.com/api/docs/pricing) の推定単価は、`gpt-transcribe` が `$0.0045/min`、`gpt-4o-transcribe` が `$0.006/min`、`gpt-4o-mini-transcribe` が `$0.003/min`、Whisperが `$0.006/min`。
- `gpt-transcribe-mini` というモデル、および文字起こしAPIで計算量を調整する `reasoning_effort` パラメータは提供されていない。`temperature` は生成のランダム性であり、コスト／計算量tierではない。
- GPT系文字起こしで低コストを優先する場合は `gpt-4o-mini-transcribe` を明示的に選ぶ。`gpt-transcribe` を低effort設定へ変形しない。
- タイムスタンプ、字幕形式、英訳、話者分離が必要な場合は、それぞれの専用モデル／経路を使う。今回の一般的なファイル文字起こし経路には混ぜない。

## 現状監査で確認した問題

モデル追加が単一箇所の変更では完結しない。現在は少なくとも次の場所が個別のモデル一覧またはモデル分岐を持つ。

- `src/ApiSettings.ts`: `TranscriptionModel` と既定値
- `src/config/constants.ts`: `MODEL_NAMES`
- `src/config/ModelOptions.ts`: ドロップダウン順
- `src/infrastructure/storage/PluginStateRepository.ts`: 保存値の許可リスト
- `src/config/ModelProcessingConfig.ts`: モデルから処理設定への対応と料金
- `src/config/ModelCleaningConfig.ts`: モデルID別のクリーニング戦略
- `src/config/openai/GPT4oTranscribeConfig.ts`: 対応モデル、料金、表示名、リクエスト形式
- `src/config/openai/index.ts`: 利用可能モデルと設定種別
- `src/infrastructure/api/openai/GPT4oClient.ts`: 対応モデル、モデルマップ、FormData直列化
- `src/application/TranscriptionController.ts`: Whisper/GPT経路と直接アップロード経路
- `src/core/transcription/TranscriptionJobPlan.ts`: 直接アップロード対象
- `src/SettingsUiBuilder.ts` と `src/ui/ApiTranscriptionModal.ts`: ラベル、比較文、料金、表示名
- `src/ApiTranscriber.ts` と `src/application/services/GPT4oTranscriptionService.ts`: 表示名、料金、能力
- `src/i18n/locales.ts` と4言語の翻訳
- `README.md`、`package.json`、`manifest.json`

特に、`TranscriptionController` は `gpt-4o-transcribe` 以外の非Whisperモデルをすべて `gpt-4o-mini-transcribe` に置き換える。モデルIDだけを追加すると、画面では GPT Transcribe を選択していても実際には Mini が送信される。

また、GPT系クライアントの配列直列化はカンマ結合であり、公式例の反復 `languages[]` 形式に適合しない。既存の単数 `language` をそのまま新モデルへ送ることもできない。

### 残存参照の分類

全`src/`をモデルIDと表示名で再検索し、次のように扱う。

- `MODEL_NAMES` の手書き定数は削除する。
- `ModelOptions.ts` を残す場合も、プロファイルから導出する互換adapterだけにし、モデルIDを再列挙しない。
- `openai/index.ts` の既存helperを残す場合も、プロファイルから導出し、独立したモデル表を持たせない。
- `WhisperConfig.ts` の `whisper-1` はWhisper APIそのものの固定model fieldであり、選択可能モデル一覧ではないため維持する。
- `RealtimeApiConfig.ts` は未使用の別protocol契約であり、今回のファイルモデルプロファイルには接続しない。`gpt-live-transcribe` の追加も行わない。
- `TranslationUtils.ts` の `gpt-4o`／`gpt-4o-mini` は後処理用チャットモデルであり、文字起こしモデルではないため変更しない。
- `TranscriptionTypes.ts` の `gpt4o` options、クリーニングpipeline type、既存GPT系クラス名は内部互換名として維持する。
- `ApiSettingsTab.ts` の検索aliasには GPT Transcribe を追加する。
- `config/config.ts` の構成コメントは現在のファイル名とプロファイル構造に合わせて更新する。
- モデル名を例示するコメントは、閉じた許可リストに見える箇所だけ一般化またはGPT Transcribeを追加する。

## Goals

- 画面で `gpt-transcribe` を選択し、保存し、再読込し、選択した同一モデルをAPIへ送れること。
- モデル固有の差分を1つのプロファイルから解決し、追加時の許可リスト漏れや誤ルーティングを防ぐこと。
- 既存4モデルのルーティング、リクエスト、料金、処理、クリーニング、保存動作を維持すること。
- `gpt-transcribe` のAPI方言を公式仕様どおりにすること。
- 未知モデルを別モデルとして実行せず、実行時には fail closed にすること。
- 既存の直接アップロード、選択範囲、ローカルVAD、クライアント分割、重複除去の契約を維持すること。
- UIの比較文を、現在の公式推奨と矛盾しない表現へ更新すること。
- 将来モデルを追加する際、プロファイルと必要な専用処理だけを追加すれば、共通の一覧・保存・表示・料金・ルーティングへ反映される構造にすること。

## Non-goals

- 保存済みの有効なモデル選択を `gpt-transcribe` へ強制移行すること。
- `gpt-live-transcribe`、Realtimeセッション、マイク入力を追加すること。
- `stream=true` によるファイル文字起こしの部分応答を追加すること。
- `keywords` をユーザー辞書から自動生成すること。
- 複数言語を選ぶUIを追加すること。
- 検出言語をノートやUIへ表示・保存すること。
- タイムスタンプ、字幕、英訳、話者分離の経路を変更すること。
- VAD閾値、音声分割、重複除去、後処理アルゴリズムを再調整すること。
- GPT系の既存クラス／ファイル名を大規模に改名すること。
- 有料APIを使った本番音声の受け入れ試験、リリース、公開、push。

## 検討した案

### A. 既存のunionと許可リストへ文字列を追加する

却下。変更箇所が多く、今回確認したMiniへの暗黙変換や料金表示漏れを再発させる。

### B. UIと保存だけをプロファイル化する

却下。API方言、処理、クリーニング、直接アップロードが別のモデル表を持ち続けるため、一元化の目的を満たさない。

### C. すべての処理閾値を巨大なモデルプロファイルへ移す

却下。モデル選択メタデータと、長い処理／クリーニング設定を結合すると、プロファイルが読みにくくなり、同じ挙動を共有するモデル間で巨大な設定複製が発生する。

### D. プロファイルが意味的なpresetを参照する

採用。プロファイルはモデルごとの差分とpresetへの対応だけを持つ。処理閾値とクリーニング規則は専用モジュールに残し、複数モデルで同じpresetを安全に共有する。

## 一元化の境界

新設する `src/config/TranscriptionModelProfiles.ts` を、設定画面で選択可能なファイル文字起こしモデルの正本とする。

この正本が所有するもの:

- ローカル設定ID
- APIへ送るモデルID
- ドロップダウン順
- 現在の既定モデル
- 実行ワークフロー
- APIの言語ヒント方式
- 処理 preset
- クリーニング preset
- 分単価と通貨
- タイムスタンプ対応
- 元ファイル直接アップロードの対象可否
- 内部表示名
- UIとprovider表示に使う翻訳キー
- モデル比較欄への掲載情報

この正本が所有しないもの:

- API全体で共通のエンドポイント
- ファイルサイズやクライアント分割などの共通transport policy
- 処理presetの具体的な秒数・重複閾値
- クリーニングpresetの具体的な正規表現・削減率
- Realtimeセッション専用モデル
- 後処理用チャットモデル

共通transport policyをモデルごとに複製しない。既存の競合する上限値をこの機能へ便乗して変更せず、今回触れる参照は既存の正本へ寄せる。上限値そのものの変更は、音声payload routingの別契約で扱う。

## プロファイルの形

実装時の概念形は次のとおりとする。型名やimport順の微調整は許容するが、責務は変えない。

```ts
interface TranscriptionModelProfileBase {
  id: string;
  apiModel: string;
  isDefault: boolean;
  workflow: 'whisper' | 'openai-file';
  request: {
    languageField: 'language' | 'languages';
  };
  processingPreset:
    | 'whisper-standard'
    | 'whisper-timestamps'
    | 'recorded-accurate'
    | 'recorded-economy';
  cleaningPreset:
    | 'whisper'
    | 'recorded-accurate'
    | 'recorded-economy';
  pricing: {
    costPerMinute: number;
    currency: 'USD';
  };
  capabilities: {
    timestamps: boolean;
    originalDirectUpload: boolean;
  };
  displayName: string;
  ui: {
    optionLabelKey: keyof TranslationKeys['settings']['model'];
    providerKey: keyof TranslationKeys['providers'];
    comparison: {
      nameKey: keyof TranslationKeys['settings']['model'];
      descriptionKey: keyof TranslationKeys['settings']['model'];
    } | null;
  };
}

export const TRANSCRIPTION_MODEL_PROFILES = [
  // ordered readonly profiles
] as const satisfies readonly TranscriptionModelProfileBase[];

export type TranscriptionModel =
  typeof TRANSCRIPTION_MODEL_PROFILES[number]['id'];
```

モデルIDの型はプロファイル配列から導出し、別のunionを手書きしない。翻訳キーは `TranslationKeys` の `keyof` で制約し、存在しないキーをコンパイル時に拒否する。

同じモジュールから以下を提供する。

- `DEFAULT_TRANSCRIPTION_MODEL`
- `isTranscriptionModel(value: unknown): value is TranscriptionModel`
- `getTranscriptionModelProfile(model: string)`
- 必要なworkflow／capability判定helper

`getTranscriptionModelProfile` は未知IDに対して利用可能IDを含む明示的なエラーを投げる。任意の既知モデルへのフォールバックは行わない。

## 正式なモデル表

プロファイル配列の順序を、設定画面とモーダルのドロップダウン順に使う。

| 設定ID | API model | 既定 | workflow | 言語field | processing preset | cleaning preset | 直接upload | timestamp | USD/min |
|---|---|---:|---|---|---|---|---:|---:|---:|
| `gpt-transcribe` | `gpt-transcribe` | Yes | `openai-file` | `languages` | `recorded-accurate` | `recorded-accurate` | Yes | No | 0.0045 |
| `gpt-4o-transcribe` | `gpt-4o-transcribe` | No | `openai-file` | `language` | `recorded-accurate` | `recorded-accurate` | Yes | No | 0.006 |
| `gpt-4o-mini-transcribe` | `gpt-4o-mini-transcribe` | No | `openai-file` | `language` | `recorded-economy` | `recorded-economy` | Yes | No | 0.003 |
| `whisper-1` | `whisper-1` | No | `whisper` | `language` | `whisper-standard` | `whisper` | No | No | 0.006 |
| `whisper-1-ts` | `whisper-1` | No | `whisper` | `language` | `whisper-timestamps` | `whisper` | No | Yes | 0.006 |

`whisper-1-ts` はローカルの出力モードIDであり、APIモデルは `whisper-1` のままとする。

## 実行時データフロー

```text
stored/UI model id
        |
        v
getTranscriptionModelProfile()
        |
        +--> UI label / provider / pricing
        +--> processing preset
        +--> cleaning preset
        +--> direct-upload capability
        `--> workflow
               |
               +--> whisper
               `--> openai-file
                        |
                        `--> request.languageField
                               +--> language
                               `--> languages[]
```

Controllerは文字列prefixや「4oでなければMini」という条件を持たない。必ずプロファイルを解決し、`workflow` で分岐し、選択された `profile.id`／`profile.apiModel` をそのままサービスとクライアントへ渡す。

既存の `GPT4oClient`、`GPT4oTranscriptionService`、`GPT4oTranscriptionStrategy` という内部名は今回維持する。約90箇所の機械的改名をAPI方言変更と同じ差分に混ぜるより、動作変更を小さくレビュー可能に保つためである。ただし、対応モデル一覧、表示名、料金、ログ上のモデル表現はプロファイルから取得し、GPT TranscribeをMiniへ変換しない。一般名への改名は、無動作変更の別タスクで実施できる。

## APIリクエスト契約

共通のリクエストbuilderは、選択モデルのプロファイルを必ず受け取る。

| UIの言語設定 | `gpt-transcribe` | 既存GPT-4o系 | Whisper |
|---|---|---|---|
| `auto` | `language` も `languages[]` も送らない | `language` を送らない | `language` を送らない |
| `ja` | `languages[]=ja` を1回送る | `language=ja` | `language=ja` |
| `en` | `languages[]=en` を1回送る | `language=en` | `language=en` |
| `zh` | `languages[]=zh` を1回送る | `language=zh` | `language=zh` |
| `ko` | `languages[]=ko` を1回送る | `language=ko` | `language=ko` |

実装上の条件:

- `gpt-transcribe` のpayload型は `languages?: string[]` を持ち、`language` と同時に生成できない構造にする。
- FormDataでは各要素を `formData.append('languages[]', value)` で追加する。
- カンマ結合、JSON文字列化、`languages` という括弧なしfieldは使用しない。
- 既存GPT-4o系の `language` と既存のprompt／前チャンク末尾の挙動は維持する。
- `temperature=0`、非streaming、通常JSON応答という現在の契約を維持する。
- 通常経路で `chunking_strategy` を送らない。
- `gpt-transcribe` 応答の `languages` は型として受け入れるが、今回の出力には追加しない。
- 不正または未対応モデルは、HTTP送信前にエラーにする。

## Promptとkeywords

既存のカスタムpromptと、分割時の直前チャンク末尾は `gpt-transcribe` にも使用できる。promptは音声の内容や継続文脈として送り、「文字起こしをせよ」という一般指示テンプレートを追加しない。

`keywords` は今回送らない。ユーザー辞書は確定的な後段補正を目的にしており、その全項目をAPI hintへ自動転用すると、実際に発話されていない語の混入リスクがある。将来追加する場合は、明示的なopt-in、文字制約、件数／長さ上限、音声付き評価を別途設計する。

## 処理preset

`ModelProcessingConfig` はモデルIDマップと料金を所有しない。意味的なpresetだけを所有し、`getModelConfig(model)` はプロファイルを解決してpresetを取得し、プロファイルの料金を合成した解決済み設定を返す。

- `gpt-transcribe` と `gpt-4o-transcribe` は現在の高精度側設定を `recorded-accurate` として共有する。
- `gpt-4o-mini-transcribe` は現在のMini設定を `recorded-economy` として使う。
- 2つのWhisperモードは、それぞれ現在の処理設定を維持する。
- `gpt-transcribe` 専用の分割時間、merge閾値、VAD閾値は実測なしに追加しない。
- キャッシュキーはモデルIDとし、料金とモデルidentityが混同しないようにする。

既存の `getModelConfig(...).pricing` という利用側インターフェースは維持して、呼び出し元の変更量を抑える。

## クリーニングpreset

`ModelCleaningConfig` は巨大な戦略をモデルIDごとに複製しない。presetを保持し、モデルプロファイルからpresetを解決したうえで、返却時に `modelId` と `modelName` を選択モデルの値へ設定する。

- `gpt-transcribe` は高精度側の `recorded-accurate` を使用する。
- GPT-4o Transcribeの現行戦略を同じpresetへ移す。
- Miniは現行の保守的なMini戦略を `recorded-economy` として維持する。
- 2つのWhisperモードはWhisper presetを共有する。
- 未知モデルをMini戦略へ落とすfallbackは削除し、明示的にエラーにする。
- debug overlayはpreset単位で適用し、現在overlayが存在する範囲を越えて新しい挙動を作らない。

## 保存と後方互換性

- `DEFAULT_API_SETTINGS.model` はプロファイルから導出した `gpt-transcribe` に変更する。
- 保存済みの4モデルは同じ文字列で読み書きする。
- 新しい `gpt-transcribe` は有効な保存値として読み書きする。
- 旧データの欠落値または未知文字列は、保存データ正規化時に既定モデルへ戻す。これは壊れた永続データからの復旧であり、実行時ルーティングのfallbackではない。
- 既存の有効な保存済みモデル値は、現在の選択を維持して強制移行しない。
- 新モデルを選んでも他の設定やユーザー辞書を書き換えない。
- 設定スキーマのバージョン移行は不要。

## UIと翻訳

ドロップダウンは5項目、比較欄は機能上重複する2つのWhisperモードをまとめて4行とする。

### ドロップダウン

1. GPT Transcribe（推奨）
2. GPT-4o Transcribe
3. GPT-4o Mini Transcribe
4. Whisper-1（タイムスタンプなし）
5. Whisper-1（タイムスタンプあり）

「推奨」は録音済み音声に関する現在の公式推奨を示し、新規設定の既定値でもある。既存の有効な保存済み選択を強制変更する意味ではない。

### 比較文

| locale | GPT Transcribe | GPT-4o Transcribe | GPT-4o Mini Transcribe | Whisper-1 |
|---|---|---|---|---|
| ja | 録音済み音声向けの推奨モデル | 既存の高精度モデル | GPT系で最も低コスト | タイムスタンプが必要な場合 |
| en | Recommended for recorded speech | Existing high-accuracy model | Lowest-cost GPT transcription option | Use when timestamps are needed |
| zh | 录制语音的推荐模型 | 现有的高精度模型 | 成本最低的 GPT 转录选项 | 需要时间戳时使用 |
| ko | 녹음된 음성에 권장되는 모델 | 기존 고정확도 모델 | 가장 저렴한 GPT 전사 옵션 | 타임스탬프가 필요할 때 사용 |

現在の「GPT-4o Transcribe: 最高精度」という比較表現は、新モデル追加後には根拠が不足するため置き換える。中国語のWhisperラベルに埋め込まれた価格も削除し、料金の正本をプロファイルだけにする。

設定画面、文字起こしモーダル、進捗provider名、コスト詳細は同じプロファイルと翻訳キーを使用し、個別switchを持たない。

## ドキュメントとメタデータ

- READMEの英語・日本語のモデル一覧、推奨表現、料金、利用モデル説明を更新する。
- `package.json` と `manifest.json` の説明を「GPT-4oとWhisperのみ」と読めない一般的なOpenAI transcription表現へ更新する。
- `ApiSettingsTab.ts` の検索aliasと `config/config.ts` の構成コメントを更新する。
- 長時間文字起こしチェックリストの対象モデルへ `gpt-transcribe` を追加し、言語fieldの確認項目を加える。
- 過去の設計文書は履歴として書き換えない。本書がモデル比較文と新モデル追加に関する最新契約になる。
- バージョン番号とrelease assetは変更しない。

## エラー処理

- 保存データの未知モデル: 既定モデルへ正規化。
- 実行時の未知モデル: API送信前に例外。
- workflowとサービスの不一致: API送信前に例外。
- `gpt-transcribe` で単数 `language` が生成された場合: テストで失敗させる。
- 既存GPT-4o系で `languages[]` が生成された場合: テストで失敗させる。
- APIエラー、キャンセル、リトライ、進捗処理: 現行契約を維持。

未知モデルをMiniへ落として処理を続ける挙動は、選択と請求の不一致を生むため許可しない。

## テスト戦略

実装前に、次の失敗テストを追加する。

### プロファイル

- 5つのIDと順序が期待どおり。
- IDが一意。
- 既定プロファイルが正確に1つで `gpt-transcribe`。
- 全モデルの料金が正で、通貨がUSD。
- `gpt-transcribe` の価格、workflow、言語field、preset、capabilityが表どおり。
- 全プロファイルのUIキーが4言語すべてで解決できる。
- 未知IDのtype guardはfalse、getterは例外。

### 保存

- `gpt-transcribe` が保存・再読込できる。
- 既存4モデルが同じ値で往復する。
- 未知保存値は既定モデルへ戻る。

### リクエスト

- `gpt-transcribe` + `ja` は `languages: ['ja']` を生成し、`language` を生成しない。
- `gpt-transcribe` + `auto` はどちらも生成しない。
- FormDataは `languages[]=ja` を反復fieldとして送る。
- 既存GPT-4o + `ja` は従来どおり `language=ja`。
- 既存モデルのprompt、前チャンク文脈、stream、`chunking_strategy` 非送信を維持。

### ルーティング

- workflow経路と元ファイル直接アップロード経路の両方で、`gpt-transcribe` が同じIDのままサービスへ渡る。
- `gpt-transcribe` は条件を満たす元ファイルで直接アップロード対象。
- 時間範囲、ローカルVAD、サイズ超過、非対応拡張子では従来どおりclient経路。
- 未知の非Whisper文字列がMiniへ変換されない。
- 既存4モデルの経路が変わらない。

### 処理・クリーニング・料金

- `gpt-transcribe` は `recorded-accurate` の処理値とクリーニング値を使う。
- 解決後の `modelId`、`modelName`、料金はGPT Transcribe自身の値。
- 未知のクリーニングモデルはMini fallbackにならず例外。
- API facadeとモーダルの料金計算は `$0.0045/min` を使い、Mini判定の二択を持たない。

### UIと文書

- ドロップダウン5項目、比較4行。
- 4言語の文言が本書の表と一致。
- provider表示にGPT Transcribeが出る。
- README、manifest、package descriptionが追加モデルと矛盾しない。

## 実装順

承認後、各動作について失敗テストを先に確認し、最小実装で通す。

1. プロファイルの契約テストを追加する。
2. `TranscriptionModelProfiles.ts` と型・getter・type guardを実装する。
3. 設定型、既定値、保存正規化、モデル一覧をプロファイルへ接続する。
4. 処理presetと料金をプロファイル経由にする。
5. クリーニングpresetをプロファイル経由にする。
6. API request builderとFormData直列化へ `languages[]` 方言を追加する。
7. Controllerとjob plannerをworkflow/capability駆動にし、Miniへの暗黙変換を削除する。
8. 設定画面、モーダル、provider、料金をプロファイル駆動にする。
9. 4言語、README、manifest、package、長時間チェックリストを更新する。
10. 重複モデル表と到達不能な分岐を再検索し、残存箇所を用途別に確認する。
11. 対象テスト、全テスト、lint、TypeScript build、生成物lintを実行する。
12. Obsidian October self-critique checklistを再確認し、差分を最終監査する。

## 受け入れ条件

- `gpt-transcribe` を選択、保存、再読込、実行できる。
- 送信modelは常に `gpt-transcribe` で、Miniへ置換されない。
- 明示言語は `languages[]`、自動判定は言語fieldなし。
- 既存GPT-4o系は単数 `language` のまま。
- 料金見積りはプロファイルの `$0.0045/min`。
- 新規・欠損・不正な保存設定の既定モデルは `gpt-transcribe`。
- 既存の有効な保存済みモデル選択は強制変更されない。
- 既存4モデルの保存・経路・API request・料金・処理が回帰しない。
- すべての選択可能モデルが処理preset、クリーニングpreset、UI翻訳、provider表示、料金を持つ。
- 未知モデルは実行時にfail closed。
- `keywords`、Realtime、streaming、既存保存値の強制移行、リリース変更が差分に含まれない。
- `npm run lint`、`npm run build`、全Jest、生成物lintが成功する。

## 残る検証境界

単体・統合テストとローカルbuildでは、request構造とルーティングの正しさは検証できる。一方、モデル間の実音声品質、固有名詞、コードスイッチ、幻覚、レイテンシ、実請求は有料APIを使う評価が必要であり、今回の自動検証には含めない。

最初のリリースでは専用閾値や自動keywordsを加えず、同一音声で「既存4o」「モデルだけGPT Transcribeへ変更」「将来context hintを追加」の順に比較できる状態を作る。これにより、モデル変更の効果と追加hintの効果を分離できる。
