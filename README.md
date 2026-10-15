# kintoreapp

1人用の筋トレ記録アプリ。簡単な記録と朝倉栞との日常を通じて、また開きたくなる体験を作る。Android縦画面、データ保全、原則無料、休んだ日を責めない設計を重視する。

## 作業の入口

- **[3プロジェクトの共通案内・導入手順](docs/project-guide.md)**：担当、登録資料、制作物の受け渡し、ChatGPTで行う操作。
- 専用指示：[アプリ開発](docs/development-handoff.md) ／ [ビジュアル制作](docs/visual-production-instructions.md) ／ [セリフ・物語制作](docs/dialogue-production-instructions.md)。各ファイルの全文を対応プロジェクトの指示欄へ貼る。
- **[実装状況と確認範囲](docs/implementation-status.md)**：現在の画面・機能・素材の接続、試作・未実装、検証履歴。常設指示へ実装一覧を複写しない。
- **[キャラクター資料](docs/shiori/README.md)**：人物・外見・口調・正式画像の正本への入口。担当ごとに必要な資料を読む。

## 開発環境・公開

| 項目 | 内容 |
|---|---|
| GitHub／本番ブランチ | [k4n7x2/kintoreapp](https://github.com/k4n7x2/kintoreapp) ／ `main` |
| 公開URL | https://kintoreapp.q7m4vx9.workers.dev |
| ホスティング・API | Cloudflare Workers（Pagesは使用しない） |
| DB | Cloudflare D1 `kintore-db` ／ Binding `DB` |
| Database ID | `08e556f8-8c88-47af-bac8-5c3ac4ed2903` |
| Worker入口 | `src/index.js` |
| 静的配信元 | `public/` ／ Binding `ASSETS` |
| フロントエンド | HTML・CSS・JavaScript |

環境設定は[wrangler.jsonc](wrangler.jsonc)、コマンドは[package.json](package.json)を正とする。`/api/*`はWorker処理優先。`docs/`は静的配信されないため、公開サイトの`/docs/...`を画像取得元として推測しない。

通常の公開経路はmain更新→Cloudflare Workers Builds→`npx wrangler deploy`。不要な手動デプロイを重ねない。GitHubへのコミット、Workers Builds成功、本番の応答・画面確認はそれぞれ別に確認する。GitHub Actionsの有無だけでデプロイ結果を判断しない。

## 現行の個人用認証

Cloudflare Zero Trust / Accessは使用しない。Runtime Secret `APP_PASSWORD`に設定した1つのパスワードでログインする。方式を独断で変更せず、Secretをコード・ログ・会話へ出さない。ユーザーにSecretの送信を求めない。

| 項目 | 現行実装（正確な処理は`src/index.js`） |
|---|---|
| Secret長 | 最低4文字、最大200。下限はコードポイント数、上限はJavaScriptの`length`で判定 |
| Cookie | `kintore_session`、署名付き、14日間 |
| 属性 | `HttpOnly; Secure; SameSite=Strict; Path=/api` |
| 署名鍵 | `APP_PASSWORD`から導出。パスワード変更は既存Cookieにも影響 |
| 書き込み保護 | loginとworkoutsは同一Origin＋JSON。logoutは同一Origin |
| 制約 | 専用レート制限は未実装。最短4文字は推測に弱いため、長いランダムなパスワードを推奨 |

ログイン前は簡素なパスワード入力のみ。アプリ名・筋トレ説明・キャラクター演出を追加しない。UIの匿名性と公開リポジトリ・静的ファイルの公開範囲は別である。個人記録APIには認証が必要。

初回のSecret設定はCloudflareの対象Workerの設定から、Variables and SecretsにType **Secret**、Name **APP_PASSWORD**で登録する。通常の公開変数へ入れない。

## 永続保存とD1

- コード・正式仕様・採用済み素材・固定セリフ：GitHub。
- 個人の筋トレ記録、今後の設定・予定・会話履歴：原則Cloudflare D1。
- `localStorage`、`IndexedDB`等へ個人データを永続保存しない。認証Cookieと操作中のメモリ状態は許容。
- 固定コンテンツやブラウザの通常の静的キャッシュと、個人データの保存は区別する。個人の会話・記録を公開GitHubへ置かない。

[初期SQL](migrations/0001_initial.sql)には`workout_sessions`と`workout_sets`がある。現行APIは前者のみを利用する。SQLファイルの存在は本番適用の証拠ではなく、`/api/health`の`SELECT 1`成功もテーブル・保存処理の証明ではない。

既存DBを削除・再初期化しない。初回セットアップ時はD1 Consoleまたはマイグレーションで適用するが、過去のConsole適用とマイグレーション管理の差を先に確認する。既存の列構造とデータを確認し、必要な追加マイグレーションを用意する。

## API（個人用）

| HTTP | エンドポイント | 内容 |
|---|---|---|
| GET | `/api/health` | 公開診断。D1接続とSecret設定有無 |
| POST | `/api/login` | パスワード認証、Cookie発行 |
| GET | `/api/session` | Cookie検証。未認証は401 |
| POST | `/api/logout` | Cookie破棄。認証前にも扱う |
| GET | `/api/workouts?month=YYYY-MM` | 月別記録、最大200件 |
| POST | `/api/workouts` | `{"performed_on":"YYYY-MM-DD","note":"..."}`を保存 |
| DELETE | `/api/workouts/:id` | 記録削除 |

日付は2000～2100年の実在日、メモは最大300（JavaScriptの`length`）。同日複数記録が可能。実施日数と件数は別で、月200件超は全件集計にならない。記録更新・セット操作・設定保存APIは未実装。Secret未設定・不正長では`/api/health`以外のAPIは503。

## 開発・必要時の確認

```bash
npm install
npm run dev
npm run db:migrate:local
```

開発用Secretはコミットしない。`npm run db:migrate:remote`は本番DBを変更するため、対象・既存データ・影響・実行の承認範囲を確認して扱う。

アプリ変更時は関連する構文・参照・API・画面を確認する。表示変更ではAndroid相当の狭い幅、キーボード、重なり・見切れを確認する。保存変更では認証→記録→再取得→再読み込み後の保持と未認証拒否まで必要に応じて確認する。不要な本番テスト記録は追加しない。

文書だけの変更は記載と相互参照を検証し、全体の動作テストや本番DB操作を追加しない。確認したSHA・工程・証拠・未確認範囲は[実装確認記録](docs/implementation-status.md)または作業報告に残す。
