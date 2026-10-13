# kintoreapp

1人用の筋トレ記録アプリ。GitHubでソース管理、Cloudflare Workersで公開、D1に記録を保存する。

## 今回の認証方式

**Cloudflare Zero Trust / Accessは不要。クレジットカード登録も不要。**

- Cloudflare WorkersのSecret `APP_PASSWORD` に設定した1つの強いパスワードでログイン。
- ログインすると14日間有効な署名付きCookie（`HttpOnly; Secure; SameSite=Strict`）を発行。
- Cookieは認証状態のみで、筋トレ履歴をブラウザのLocalStorageやIndexedDBに保存しない。
- 公開URLにアクセスすると画面自体は見えるが、記録の読み書きは認証なしでは401になる。
- パスワードをGitHubのコードに書かない。ChatGPTに送信しない。

### 1. CloudflareにSecretを1つ登録

Cloudflareダッシュボードで **Workers & Pages → kintoreapp → Settings → Variables and Secrets → Add** を開く。

| 項目 | 値 |
|---|---|
| Type | Secret |
| Name | `APP_PASSWORD` |
| Value | 自分で決める20文字以上の推測困難なパスワード |

**必ずSecretとして登録**し、通常の公開変数やリポジトリに入れない。
数字4桁・誕生日・簡単な単語は避ける。20文字以上のランダムな英数字を推奨。少なくとも20文字未満だと安全のため認証機能を有効にしない。

保存後、必要に応じてデプロイの確認をする。Zero Trustの初期設定は途中で止めてよい。

### 2. D1のテーブルを初期化

Cloudflare → **Storage & databases → D1 → kintore-db → Console** を開き、[初期SQL](migrations/0001_initial.sql)の内容を貼り付けて実行する。

このSQLはまだ自動適用していない。GitHubに置くだけではDBへ反映されない。

すでに `workout_sessions` を作成している場合は構造を確認すること（本実装は個人用で `owner_email` 列を使わない）。むやみに既存テーブルを削除しない。

### 3. 初回テスト

公開URL: https://kintoreapp.q7m4vx9.workers.dev

1. ページの「自分専用ログイン」にSecretで設定したパスワードを入力。
2. 「ログイン済み」が出たら、日付とメモを登録。
3. 再読み込み後もカレンダーに記録が残れば、D1への保存確認成功。
4. 「ログアウト」でCookieが無効化され、記録が見えなくなる。
5. 未ログインの `/api/workouts?month=2026-10` が401で拒否されることも確認する。

## API（個人用）

| HTTP | エンドポイント | 内容 |
|---|---|---|
| GET | `/api/health` | D1接続とSecret設定有無 |
| POST | `/api/login` | パスワード認証、署名付きCookie発行 |
| GET | `/api/session` | ログイン状態確認 |
| POST | `/api/logout` | 認証Cookie破棄 |
| GET | `/api/workouts?month=YYYY-MM` | 月別記録一覧 |
| POST | `/api/workouts` | `{"performed_on":"YYYY-MM-DD","note":"..."}` |
| DELETE | `/api/workouts/:id` | 記録削除 |

書き込みはブラウザからの同一オリジン要求に限定。ログイン成功までは書き込みAPIへアクセスできない。

**パスワードの総当たり対策:** 長いランダムパスワードを必須にしている。大量のログイン試行に対する専用のレート制限は現時点では未実装。重要なデータで使用する際はCloudflare WAFなどの追加対策を検討すること。

## 今後の拡張

- 種目・重量・回数を数秒で登録するUI（`workout_sets` スキーマのみ準備済み）
- トレーニング予定・メニューのD1保存
- 朝倉栞の演出・セリフ更新
- ジムWi-Fi連動（Androidで対応可能な方法を別途検討）

## 開発

```bash
npm install
npm run dev
```

ローカルでは `APP_PASSWORD` 未設定の場合、記録APIは503を返す。開発用Secretはコミットしない。
本番デプロイは `main` にマージ後、CloudflareのWorkers Builds経由で `npx wrangler deploy` を実行。

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

`db:migrate:remote` は本番DBを変更するため事前確認を要する。Consoleで直接SQLを実行した場合はマイグレーション管理上の扱いに注意。
