# MacroDroid / ジムWi-Fi在席状態 — 接続ガイド（第1段階）

ジムWi-Fiへの接続・切断を Android の MacroDroid で検知し、個人用Cloudflare Workersに通知するための専用API。**MacroDroid通知単体では来館を記録しない**。在席状態は画面演出と、アプリ起動時の別APIによる来館登録の判定に使用する。

## 実装の段階

- 第1段階（このPR）：D1の専用状態テーブルと認証付き通知API、ログイン済み状態取得API。
- 第2段階（別PR）：ホームの衣装・背景・ジム専用セリフとの連動。現時点ではAPIを書き換えても画面の衣装は自動で変わらない。
- 第3段階：AndroidのMacroDroid設定と接続・切断の実機確認（端末設定は別工程）。
- 2026-10-25追加：ログイン済みでアプリを開いた際、`POST /api/gym-presence/check-in` で期限内在席状態をサーバー側で確認し、当日（JST）の来館だけを自動登録。通知だけでは登録しない。

## セキュリティ

1. Cloudflare Worker `kintoreapp` の **Variables and Secrets** に、Type **Secret**、Name `GYM_PRESENCE_TOKEN` を設定。32～256文字の英数字・`_`・`-`だけからなる十分にランダムなトークンを自分の端末で生成する（例：`openssl rand -hex 32` が生成する64桁の16進文字列）。
2. このトークンは `APP_PASSWORD` とは別物。チャット・GitHub・スクリーンショット・公開URL・URLクエリ・ログに値を残さない。MacroDroidの設定は端末内で行い、マクロを共有・エクスポートする場合は認証情報を削除する。
3. 認証用CookieはMacroDroidへ渡さない。POST用Bearerトークンはこの専用エンドポイントの在席フラグ変更だけを許可する。
4. Secret未登録時は専用POSTが503。既存の筋トレAPIやログインには影響しない。

## API

接続／切断通知：

```http
POST https://kintoreapp.q7m4vx9.workers.dev/api/integrations/macrodroid/gym-presence
Authorization: Bearer <GYM_PRESENCE_TOKENの値>
Content-Type: application/json

{"connected":true,"event_at_ms":1790000000000}
```

切断時は `connected:false`。 `event_at_ms` はMacroDroidで検知したイベント発生時刻（Unixミリ秒）。**キュー送信・30秒待ち・通信再試行時に送信時刻で上書きしない**。遅延イベントの順序逆転を判定できなくなるため。

- 未来へのずれ5分超、24時間超過の古いイベント、非整数タイムスタンプ、不正JSON、余分なキーは400。
- トークン不一致／欠落は401。同じタイムスタンプの二重送信、最新時刻より古い通知は200 `accepted:false` として無視。
- 有効なON報告を受信すると **30分間**有効。接続中は **10分ごとに更新**。正常なOFF通知を受けたら即時失効。通知が来ない場合は期限経過で自動OFFとして読み出す。
- SSIDや現在地はAPIへ送信しない。WorkerはMacroDroidが報告した状態を保存するだけで、Webから実際のWi-Fi接続状態を検証する機能はない。

ログインCookieで取得（ブラウザ用）：

```http
GET /api/gym-presence
```

例：`{"connected":true,"last_event_ms":1790000000000,"expires_at_ms":1790001800000,"server_time_ms":1790000000000}`。未報告や期限切れは `connected:false`。未ログインは401、0009未適用は503。個人データをブラウザの永続Storageには保存しない。

## MacroDroid設定方針

### 入館マクロ
- トリガー：対象SSIDのWi-Fiに接続した場合。
- 直後に整数変数へ `{system_time_ms}` を代入し、イベント時刻として保持。
- Wi-Fiが同一SSIDに接続していることを再確認し、HTTPS POST：`connected:true`、`event_at_ms` は保持した変数。
- 通知失敗を無視しない。通信が戻ったときに接続状態を再同期する仕組みも設ける。

### 退館マクロ
- トリガー：対象SSIDのWi-Fiから切断。
- **直後に** `{system_time_ms}` を別の整数変数へ保存してから30秒待つ。
- まだ指定SSIDから切断中なら、その保存済み時刻で `connected:false` をPOST。ネットが切断中で送信できないなら、モバイル通信回復後に送る。
- 30秒以内に再接続したときは、古い切断通知を送らない。

### 在席更新マクロ
- 10分おき。対象SSID接続中だけ、現在時刻で `connected:true` を送信。
- 端末再起動時・ネットワーク回復時にWi-Fi状態を再評価して、現在の状態を送信する。切断側の古いイベントを送る場合は保存した発生時刻を使う。

MacroDroidのHTTPリクエストアクションでは `POST`、Header Parameters（`Authorization`）、Content Body（`application/json`）を指定。時刻のマジックテキストは `{system_time_ms}`。トリガー名・権限画面はAndroid・MacroDroidのバージョンで異なるため、SSID判定と実機での通知時刻を確認する。

## 運用と検証

- マイグレーション：`migrations/0009_gym_presence.sql`（専用新規テーブルのみ）。**既存D1テーブル・行を変更しない**。
- 本番：mainへのマージ後、Cloudflare Workers BuildsのProduction Deploy command `npm run db:migrate:remote && npm run deploy` で0009が適用され、その後にWorkerが公開される。PR/Previewの本番D1適用は禁止。
- Secret設定とDB適用の順序を確認してからMacroDroidを有効化。最初の実機テストはAPIの応答とアプリ画面の演出（第2段階後）を分けて確認。
- 確認事項：正しいトークンON=200、別トークン=401、OFF=200、古いON=accepted:false、30分失効、GETログイン前401・ログイン後状態取得、0009未適用時の503、既存筋トレデータに無変更。
