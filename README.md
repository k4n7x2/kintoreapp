# kintoreapp

筋トレを無理なく続けるためのモバイル向けWebアプリ。

## 構成

- **GitHub**: アプリのソースコード・公開用画像・セリフの管理
- **Cloudflare Workers**: HTML/CSS/JavaScriptの配信、API
- **Cloudflare D1**: 運動記録・予定などのデータを保存
- **端末側**: 筋トレ記録をlocalStorage / IndexedDBに保存しない

## 安全性と現在の機能

現在は初期画面、月間カレンダー、`GET /api/health`（D1疎通確認）のみを実装しています。
**筋トレ記録の読み書きAPIは、認証ができるまで実装・公開しません。**
公開中のworkers.dev URLは誰でも閲覧できるためです。画面上の曜日は仮置きで、保存された予定ではありません。

## ディレクトリ

```text
├── wrangler.jsonc         # Workers・静的配信・D1の設定
├── package.json           # 開発・公開コマンド
├── src/index.js           # API・Worker
├── public/index.html      # 画面
├── public/styles.css      # 画面デザイン
├── public/app.js          # カレンダー、接続状態
├── migrations/
│   └── 0001_initial.sql   # 将来の筋トレ記録用テーブル
└── .gitignore
```

## D1の接続設定

Cloudflare D1の `kintore-db` のUUIDは `wrangler.jsonc` に設定済みです。`binding` 名は `DB` です。初期アプリでは `GET /api/health` からDBの疎通を確認できます。

GitHubのコードがCloudflareに正しく反映されるかは、Cloudflareの Deployments 画面で別途確認してください。

## ローカル開発

Node.jsを用意し、以下を実行します。

```bash
npm install
npm run dev
```

※ ローカル開発時は、必要に応じてD1のローカルDBを用意してください。

## データベース

認証方式・実際の保存項目が固まった後に、次のマイグレーションを適用します。

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

`db:migrate:remote` は実際の本番DBを更新します。テーブル仕様を確認してから実行してください。

## GitHub / Cloudflare

Cloudflare Workers Buildsで連携中のGitHubリポジトリ: `k4n7x2/kintoreapp`。
本番デプロイコマンド: `npx wrangler deploy`。
`wrangler.jsonc`にD1のbindingを入れて、ダッシュボードとの設定差分をなくします。

## デプロイ確認

GitHub の `main` に push した際、Cloudflare Workers Builds が自動実行される想定です。再接続後の確認では Cloudflare → Workers → kintoreapp → Deployments の新しいビルドが **Success** になっていることを必ず確かめます。公開画面が更新されない場合はビルドログを確認してください。
