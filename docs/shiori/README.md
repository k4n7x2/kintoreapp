# 朝倉 栞 — キャラクター制作・運用資料

このディレクトリは、筋トレアプリ `kintoreapp` に登場するオリジナルキャラクター **朝倉 栞（あさくら しおり）** の正式仕様を管理する。

## 作業開始時に読む順序（必須）

朝倉栞の画像生成・セリフ作成・キャラクター表示・演出・衣装差分・プロフィール作成など、**キャラクターに関係する作業の前には、GitHubの最新 `main` から以下をすべて読み込む**。

1. [character.md](./character.md) — 人物像・性格・趣味・言動の設定
2. [visual.md](./visual.md) — 顔・画風・基準画像・画像生成／保存仕様
3. [dialogue.md](./dialogue.md) — 口調・会話例・セリフ設計・NG表現
4. [reference/shiori-master-v1.jpg](./reference/shiori-master-v1.jpg) — **基準絵その1：顔・髪型・瞳・表情の最優先基準**
5. [reference/shiori-style-fullbody-v1.png](./reference/shiori-style-fullbody-v1.png) — **基準絵その2：水彩の透明感・光・アニメ調の塗り・全身バランス・花飾り**
6. [character-sheet-spec.md](./character-sheet-spec.md) — **三面図・身長と体型・私服・喜怒哀楽4表情の制作仕様書**
7. [reference/shiori-character-sheet-v1.png](./reference/shiori-character-sheet-v1.png) — **基準絵その3：正式採用済みの三面図・標準私服・喜怒哀楽・花飾り・色見本**
8. [reference/shiori-training-outfit-v1.png](./reference/shiori-training-outfit-v1.png) — **トレーニングウェアA：スポーツブラ・レギンス・羽織りの三面図**
9. [reference/shiori-training-outfit-v2.png](./reference/shiori-training-outfit-v2.png) — **トレーニングウェアB：スポーツTシャツ・ジョガーパンツの三面図**

これらの内容を省略して過去の会話や短いプロジェクト指示だけからキャラクターを推測しない。詳細を確認できなければ、その旨をユーザーに伝える。

**全身立ち絵・衣装差分・体型や表情を扱う場合は、`character-sheet-spec.md` を必ず参照すること。** 基準絵その3の画像も正式登録済み。作画資料として画像と仕様書の両方を確認する。**トレーニング衣装を制作する際は、該当するウェア設定画AまたはBも実際に参照する。**

## 設定の優先順位

1. ユーザーの最新の明示的な決定・修正
2. GitHub `main` のこのディレクトリにある確定設定・正式マスター画像
3. 既存アプリの実コード・画像・セリフデータ（**実装状態**の確認に使用）
4. 過去の会話や仮案

**「顔・表情の同一人物性はその1、塗りと光はその2、全身の比率と衣装の構造はその3」**を最優先ルールとする。画像生成には原則3枚を同時参照する。基準絵その2は背景付きの一枚絵であり、透過立ち絵ではない。衣装・ポーズ・背景は固定しない。
「確定」「仮」「未決定」を区別し、仮案を既成事実にしない。

## 保存先と実装との境界

- 設定資料：`docs/shiori/`（このディレクトリ）
- 顔・表情の基準絵その1：`docs/shiori/reference/shiori-master-v1.jpg`
- 塗り・光の基準絵その2：`docs/shiori/reference/shiori-style-fullbody-v1.png`
- 全身三面図・標準衣装・表情整理の基準絵その3：`docs/shiori/reference/shiori-character-sheet-v1.png`
- トレーニングウェア衣装A：`docs/shiori/reference/shiori-training-outfit-v1.png`
- トレーニングウェア衣装B：`docs/shiori/reference/shiori-training-outfit-v2.png`
- 表示用キャラクター画像：`public/assets/shiori/`
- ホームの時間帯別セリフ：`public/data/shiori-greetings.json`
- ログイン演出の候補セリフ：`public/data/shiori-login-dialogues.json`
- 画面・制御：`public/index.html`、`public/app.js`、`public/styles.css`

**仕様書に書かれた将来案を実装済みと扱わない。** 実際の機能、ファイルの存在、参照先はGitHubの最新コードで確認すること。

## 画像生成の必須ルール

- ユーザーの依頼に **「生成」** が明記されない限り画像生成しない。
- 生成時は**顔基準JPEG・塗り基準PNG・キャラクターシートPNGの3枚**を原則実際に読み込み、生成への参照画像として渡す。GitHubのURLを文章に貼っただけで「参照済み」としない。
- トレーニングウェア画像の生成時は、上記3枚に加えて選んだ**ウェア設定画AまたはB**を衣装の参照資料として使う。2種類は別衣装であり、v2はv1の上書き・廃止を意味しない。顔・体型・塗りはそれぞれ既存の基準絵その1〜3を優先する。
- 参照画像を渡せない場合は制約を説明し、必要に応じて添付を求める。
- **アプリに表示する立ち絵系は背景透過PNG（実アルファチャンネル必須）**。マスター画像などの制作資料はこの制限を受けない。
- 画像生成の成功、GitHubへの登録、アプリへの反映、デプロイ完了をそれぞれ別に確認する。
- 画像が生成されたという理由だけで正式素材にせず、ユーザーの採用判断を尊重する。

## 文書の更新

人物像・画風などの重要な設定変更はユーザーの合意を得てからこのディレクトリに反映する。設定の更新とコードの変更は別作業である。
旧マスター画像は上書きせず、`-v2` などの世代付きファイルとして残し、ここに現行版を明記する。
文章が増えたらこのディレクトリに分割してよいが、本ファイルから必ず辿れるようにする。
