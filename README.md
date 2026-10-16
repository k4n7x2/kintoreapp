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

[初期SQL](migrations/0001_initial.sql)の`workout_sessions`と`workout_sets`を筋トレ実績・種目別セット保存に使用する。追加SQL [`0002_calendar_days.sql`](migrations/0002_calendar_days.sql)は予定・来館フラグを独立保存する。既存のトレーニング記録は自動で来館扱いに変換しない。SQLファイルの存在は本番適用の証拠ではなく、`/api/health`の`SELECT 1`成功もテーブル・保存処理の証明ではない。

既存DBを削除・再初期化しない。初回セットアップ時はD1 Consoleまたはマイグレーションで適用するが、過去のConsole適用とマイグレーション管理の差を先に確認する。既存の列構造とデータを確認し、必要な追加マイグレーションを用意する。

## API（個人用）

| HTTP | エンドポイント | 内容 |
|---|---|---|
| GET | `/api/health` | 公開診断。D1接続とSecret設定有無 |
| POST | `/api/login` | パスワード認証、Cookie発行 |
| GET | `/api/session` | Cookie検証。未認証は401 |
| POST | `/api/logout` | Cookie破棄。認証前にも扱う |
| GET | `/api/workouts?month=YYYY-MM` | 月別記録・セット明細、最大200件（上限時は`truncated`） |
| POST | `/api/workouts` | 日付・メモと任意の`sets`を新規保存（旧形式も許容） |
| PUT | `/api/workouts/:id` | 日付・メモ・全セットをトランザクションで更新 |
| DELETE | `/api/workouts/:id` | 記録とセット明細を削除 |
| GET | `/api/exercises` | 既存の種目名候補を列挙。固定候補と統合して選択可能 |
| PUT | `/api/exercises/log` | 日付＋種目名＋その種目のセットとメモを独立保存。日付・種目名が一致する単一種目記録は更新 |
| GET | `/api/exercises/history?name=種目名` | 種目別のセット履歴（最大1200セット、認証必須）。将来の分析画面で利用可能 |
| GET | `/api/workouts/recent?name=種目名&before=YYYY-MM-DD` | 同名種目の前回セット。`before`指定時はその日より前の最新実績、未指定時は従来どおり最新実績 |
| GET | `/api/calendar?month=YYYY-MM` | 月別の予定・来館フラグ（0002必要） |
| PUT | `/api/calendar/YYYY-MM-DD` | 予定／来館の独立保存、両方falseなら該当日のフラグを削除 |

日付は2000～2100年の実在日、メモは最大300（JavaScriptの`length`）。同日複数記録が可能。実施日数と件数は別で、月200件超は全件集計にならない。種目は60文字以内、1件最大48セット。セットごとに重量（0〜2000kg）・回数（0〜1000回）を保存する。新しい種目別保存ではNFKC正規化・空白除去・英字小文字化した種目名を共通キーとして扱い、専用の種目IDは設けない。各種目1～12セットを日付ごとに保存し、他種目の記録は変更しない。旧式の全種目一括保存APIは互換性維持のため残す。繰り返し予定・種目テンプレート・お気に入りの永続保存・設定保存APIは未実装。単発の予定・来館はスイッチ切り替え時にD1へ保存する。Secret未設定・不正長では`/api/health`以外のAPIは503。

## 開発・必要時の確認

```bash
npm install
npm run dev
npm run db:migrate:local
```

開発用Secretはコミットしない。`npm run db:migrate:remote`は本番DBを変更するため、対象・既存データ・影響・実行の承認範囲を確認して扱う。

アプリ変更時は関連する構文・参照・API・画面を確認する。表示変更ではAndroid相当の狭い幅、キーボード、重なり・見切れを確認する。保存変更では認証→記録→再取得→再読み込み後の保持と未認証拒否まで必要に応じて確認する。不要な本番テスト記録は追加しない。

文書だけの変更は記載と相互参照を検証し、全体の動作テストや本番DB操作を追加しない。確認したSHA・工程・証拠・未確認範囲は[実装確認記録](docs/implementation-status.md)または作業報告に残す。


## 表示の開発設定

ホーム右上の「開発」で、ホームに重ねる小型パネルを開閉する。衣装（トレーニング／部屋着）、場所（ジム／街／大学／栞の部屋）、背景の時間帯（自動／朝／昼／夜）を変更すると、その場で反映する。私服は立ち絵準備中。パネルを開いたまま連続して切り替えられ、画面遷移・暗転はしない。

変更はメモリのみで保持し、再読み込み・再ログインでリセットする。「リセット」はトレーニング衣装・時間帯自動・場所再抽選へ戻す。時間帯固定は背景だけに適用し、セリフや記録日時を変更しない。×・開発ボタン・Escapeで閉じる。他画面やメニューを開く場合、ログアウト時にも閉じる。


## 栞の表示素材

人物素材は`public/assets/shiori/{home|gim|town|College}/{v1|v2|…}/`で場所→衣装別に管理する。`v1`・`v2`は衣装IDであり、画像の改訂番号とは分ける。配置・命名・制作プロンプトは[visual.md第6節](docs/shiori/visual.md)を参照。現行ホームの衣装選択は`gim/v1`のトレーニング画像と`home/v1`の部屋着テスト画像を参照する。場所と衣装は開発パネルで独立して切り替え、背景との自動連動は未実装。

### 記録画面の操作

記録画面は日付・予定・来館と、その日の種目カード一覧を表示する。「種目を追加」で固定候補および過去に登録された種目を検索・選択して種目専用編集ビューへ進む。種目名は履歴整合のため選択時に正規化して固定する。前回の重量・回数を見ながらセットを入力し、**「この種目を保存」**で選択中の種目だけCloudflare D1へ保存して一覧に戻る。異なる種目はまとめて保存しない。既存の同日種目カードは直接開いて更新できる。

種目を選択しただけでは記録は保存されない。編集中の値はページ内移動中はメモリで保持するが、再読み込み・ログアウトで破棄する。未保存の入力がある場合、日付変更時に確認する。過去の履歴と種目別集計はそれぞれ別の画面／APIで確認できる基盤を維持する。

### カレンダー・詳細記録の導入とDBの注意

- 追加機能は、来館・予定と筋トレ内容を独立管理する。来館登録だけなら種目入力は不要で、過去のメモのみの記録も残る。月の記録上限200件は継続。前回記録の参照は種目名の完全一致で取得する。
- `0002_calendar_days.sql` は**追加テーブルのみ**。既存の `workout_sessions` と `workout_sets` に対する破壊的変更はしない。
- **GitHubへのコミットやWorkersへのデプロイだけでは本番D1にマイグレーションが適用されない**。D1 Consoleで現行テーブルとマイグレーション適用履歴を確認し、既存のConsole適用と食い違わないことを検査してから0002を本番へ適用する。
- 0002未適用時は予定・来館欄に準備が必要と表示し、既存のトレーニング記録の読み出しと入力は継続する。本番DBの適用と実機検証は別途必要。
- 編集中のフォームは画面間移動では維持されるが、再読み込み・ログアウトで破棄される。個人データをブラウザの永続ストレージへ保存しない。
