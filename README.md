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
| Value | 自分で決める4文字以上・200文字以下のパスワード |

**必ずSecretとして登録**し、通常の公開変数やリポジトリに入れない。
最小4文字で認証可能。ただし4文字のパスワードは推測されやすいため、可能なら長いランダムなパスワードを推奨。200文字超では認証を有効化しない。

保存後、必要に応じてデプロイの確認をする。Zero Trustの初期設定は途中で止めてよい。

### 2. D1のテーブルを初期化

Cloudflare → **Storage & databases → D1 → kintore-db → Console** を開き、[初期SQL](migrations/0001_initial.sql)の内容を貼り付けて実行する。

このSQLはまだ自動適用していない。GitHubに置くだけではDBへ反映されない。

すでに `workout_sessions` を作成している場合は構造を確認すること（本実装は個人用で `owner_email` 列を使わない）。むやみに既存テーブルを削除しない。

### 3. 初回テスト

公開URL: https://kintoreapp.q7m4vx9.workers.dev

1. ページの「ログイン」にSecretで設定したパスワードを入力。
2. ホームの記録アイコンから記録画面へ進み、日付とメモを登録。
3. 再読み込み後も履歴画面のカレンダーに記録が残れば、D1への保存確認成功。
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

**パスワードの安全性:** 最小4文字を許可しているが、短いパスワードは総当たり攻撃や認証Cookieの署名に対するオフライン推測に弱い。レート制限は未実装のため重要なデータの保存には推奨しない。可能なら長いランダムパスワードを使うこと。

## 画面とテーマ

- 認証後の上部ヘッダーは固定表示。右上のアイコンでライト／ダークを切り替える。初期値は端末の配色設定に追従する。
- テーマの切り替えは操作中のメモリ上だけで、再読み込み後は端末設定に戻る。個人設定の保存API・ブラウザの永続ストレージは使わない。
- ホームは1画面に収めて縦スクロールを抑制。記録・履歴・設定画面は通常どおりスクロール可能。
- キャラクターのラベンダー系色彩と調和するプラム系ダーク／ラベンダーグレー系ライトを採用。

## 背景シーン（テスト）

- ログイン後、ジム・街・大学・栞の部屋の4か所からランダムに1つ選び、共通背景として表示。ホーム／記録／履歴／設定の画面移動では場所を変えない。
- 朝（05:00–11:59）・昼（12:00–17:59）・夜（18:00–04:59）は端末のローカル時刻で判定し、`public/assets/backgrounds/` のWebPを表示。1分ごとの確認と画面復帰時に時間帯を更新する。
- 設定の「背景シーン（テスト）」で場所を切り替え／再抽選できる。設定は今回のログイン画面表示中のメモリだけに保持し、再読み込み・再ログインで新たに抽選する。D1やブラウザの永続ストレージには保存しない。
- この場所は栞の演出上のシチュエーションであり、端末の現在地・ジムWi-Fi等による検知ではない。ログイン前の画面には表示しない。

## 衣装切り替え（テスト）

- 設定画面の「衣装（テスト）」でホームに表示する栞の衣装を変更する。初期値は既存のトレーニングウェア。
- 「部屋着」は `public/assets/shiori/home/roomwear/` のアルファ付きWebP（品質85）7枚を利用。初回は標準表情、ホームで栞をタップすると他の表情へランダムに切り替わり、従来どおりセリフとぷにっと反応も変化する。表情とセリフの意味的な連動はまだない。
- 「私服」はアプリ表示用の透過立ち絵が未登録のため、現時点では選択不可として明示。背景付きの基準絵を表示用立ち絵に流用しない。
- 衣装の選択はブラウザの実行メモリだけで保持し、再読み込み・再ログインで既定へ戻る。D1やブラウザの永続ストレージへの保存はしない。
- 将来的な「部屋背景なら部屋着」等の自動連動は今回実装しない。ログイン後の各画面のキャラクター表示範囲も既存のまま（ホームのみ）。

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

## 朝倉栞のキャラクター仕様（必読）

キャラクター関連の作業を始める前に、**[docs/shiori/README.md](docs/shiori/README.md)** を開き、リンク先の人物設定・画風・セリフ仕様を最新 `main` からすべて確認すること。

画像の正式基準は3枚：**[基準絵その1：顔・瞳・表情](docs/shiori/reference/shiori-master-v1.jpg)**、**[基準絵その2：塗り・光・透明感](docs/shiori/reference/shiori-style-fullbody-v1.jpg)**、**[基準絵その3：体型・三面図・標準私服](docs/shiori/reference/shiori-character-sheet-v1.jpg)**。要素別の優先順位と生成手順は **[キャラクター制作資料](docs/shiori/README.md)** を正本とする。画像生成時は基準絵3枚を原則実際の参照画像として渡す。アプリ用立ち絵は背景透過PNGを原則とする。

詳細設定はプロジェクト指示へ重複記載せず、`docs/shiori/` を唯一の保守対象とする。個別の実装状態は `public/` と `src/` の最新コードを確認すること。

## 開発引き継ぎ・現行状態

- [開発引き継ぎプロンプト](docs/development-handoff.md)：新しいチャットに渡す運用指示。
- [実装状況](docs/implementation-status.md)：画面・API・データの接続状況、確認範囲と制約。
- [画像の照合記録](docs/shiori/reference-audit.md)：正式JPEGとプロジェクトPNGの内容差。

静的配信元は `public/` のみ。`docs/shiori/reference/` はGitHub上の制作資料であり、Workersの `/docs/...` URLでは配信しない。ログイン前に見せるUIを簡素にしても、公開リポジトリや静的ファイルそのものが非公開になるわけではない。
