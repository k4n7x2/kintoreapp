# kintoreapp

個人向け筋トレ記録アプリ。コードはGitHub、表示・APIはCloudflare Workers、個人の記録はCloudflare D1に保存します。

## 現在の機能
- 月間カレンダー（仮の月・火・金の予定＋D1に記録済みの日）
- Cloudflare Access経由のユーザー認証
- 日付とメモの作成・月間記録の一覧・削除
- D1の接続確認
- 筋トレ記録をブラウザの `localStorage`・`IndexedDB` に永続保存しない
- 種目・重量・回数は後続実装（DBの `workout_sets` は準備済み）

**安全性:** 個人記録のAPIは `ctx.access` で確認できるCloudflare Accessの認証済み本人情報を必要とします。Cloudflare Accessを有効化しない限り、未認証の読み書きは `401` で拒否されます。記録はログインメールアドレスごとに分離し、書き込みには同一オリジンとJSONの両方を要求します。

## 最初にするCloudflareの設定（必須）

### 1. Cloudflare Accessの有効化

1. Workers & Pages → `kintoreapp` → **Access**。
2. **Protect this Worker behind Access** を選択。
3. **All traffic**（本番URL・プレビューURLも保護）を指定。
4. **Authentication policy** を自分のCloudflareアカウントに限定。自分だけを明示的に限定するには、Zero Trust → Access → Applications でメールアドレス完全一致のAllowポリシーを作成してください。
5. Apply Access を保存。
6. シークレットウィンドウで `https://kintoreapp.q7m4vx9.workers.dev` を開き、ログイン画面が出ること、許可した本人だけアクセスできることを確認。

**注意:** Worker単位のAccessを有効化するのが重要です。保護対象がPreviewのみになっていないか確認してください。ゼロトラスト初期設定が求められる場合があります。

参考: https://developers.cloudflare.com/workers/configuration/cloudflare-access/

### 2. D1のテーブル作成

Cloudflare → Storage & databases → D1 → `kintore-db` → **Console** で、`migrations/0001_initial.sql` のSQL全文を実行します。

- 初回なら `workout_sessions` と `workout_sets` の2テーブルが作られます。
- 現時点では**WorkersのコードをGitHubに置くだけではSQLは自動実行されません**。
- すでに以前のバージョンのテーブルがある場合、`CREATE TABLE IF NOT EXISTS` では既存列の変更はできません。テーブル構造を確認してから対応してください。勝手にDROPしないこと。
- セットをD1 Consoleで作成する場合はWranglerのマイグレーション管理に登録されないため、後から `db:migrate:remote` を実行する際は重複に注意してください。新規運用では原則Wranglerのマイグレーションを推奨します。

### 3. 動作確認

1. 許可したアカウントでアプリを開く。
2. 画面に `認証済み` と表示され、D1保存ボタンが有効になること。
3. 実施日とメモを登録し、ページを再読み込みしても記録が残っていること。
4. 記録済みの日はカレンダーにチェックがつくこと。

D1テーブルが未作成の間は保存ボタンが有効にならず、画面に `D1のテーブル準備が必要` と表示されます。

## 開発者向け

```text
wrangler.jsonc            # Workers, D1 DB=binding、Asset設定
package.json
src/index.js               # Access必須の記録API
public/index.html          # UI
public/app.js              # D1との送受信
public/styles.css
migrations/0001_initial.sql
```

### API

| HTTP | パス | 認証 | 概要 |
|---|---|---|---|
| GET | `/api/health` | 不要（AccessでWorker全体を保護） | DB疎通 |
| GET | `/api/me` | 必須 | ログインメール |
| GET | `/api/workouts?month=YYYY-MM` | 必須 | 自分の月間記録 |
| POST | `/api/workouts` | 必須 | `{ "performed_on":"YYYY-MM-DD", "note":"..." }` |
| DELETE | `/api/workouts/:id` | 必須 | 自分の記録を削除 |

操作対象の絞り込みにはAccessで認証したメールアドレスを使用します。外部から送信されるowner指定は受け付けません。パスワードやAPIキーをHTML/JSに埋め込まないこと。

### ローカルでの開発

```bash
npm install
npm run dev
# 認証がない場合、個人記録APIは401で拒否します（仕様）。
```

マイグレーションのコマンド:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

`db:migrate:remote` は実際のD1に書き込みます。実行前に既存テーブルとマイグレーション履歴を確認してください。

### 公開

GitHub `main` への更新をWorkers Buildsが受信し、`npx wrangler deploy` で公開。成功後、Workers → DeploymentsがReadyであることを確認します。
