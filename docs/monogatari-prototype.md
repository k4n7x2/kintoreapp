# kintoreapp｜Monogatari v2 演出比較試作（第1段階）

- 調査開始main SHA: `1303a3ba8aebc05f5cde34e833b24cc791fe3b7c`
- 採用した固定版: **Monogatari v2.8.0**（2026-06-18の公式安定版）
- リリース: https://github.com/Monogatari/Monogatari/releases/tag/v2.8.0
- 公式ドキュメント: https://monogatari.io/v2/
- ライセンス: **MIT**。同梱の `public/experiments/monogatari/vendor/LICENSE` は公式 `dist/engine/LICENSE` と同一。
- エンジン同梱元: `Monogatari/Monogatari@v2.8.0:dist/engine/core/`
- 同梱本体: `vendor/monogatari.js`（2,675,936 B）、`vendor/monogatari.css`（140,118 B）。合計2,816,054 B（約2.82MB、非圧縮、HTTP圧縮前）。debugバンドルとソースマップは配布しない。

## 実装境界

1. イベント画面に従来の「テスト」と独立した「Monogatari試作」の2入口を設ける。
2. 試作は `/experiments/monogatari/index.html` の専用iframe内で遅延ロードする。エンジンのCSSとグローバル変数はアプリ画面へ伝播しない。CDN取得なし。
3. 設定は `ServiceWorkers:false`、`Preload:false`、`AutoSave:0`、`Slots:0`、`Screenshots:false`、`ShowMainScreen:false`、`AllowRollback:false`。Service Worker、PWA・独立メニュー、セーブ／ロード／QuickMenuのUIは登録・設置しない。
4. 内部で必要なストレージアダプタは `SessionStorage` とし、LocalStorage／IndexedDB等の永続ストレージは使用しない。試作台本内で個人情報や会話履歴、プレイヤー進行を保存しない。再入場時は新しいiframeへ差し替え初期状態から開始する。
5. 完了時のiframe `postMessage` は親側でオリジンおよび送信元のiframeを照合。明示終了・ブラウザ戻り・完走時は `about:blank` を再設定して実行状態を破棄する。
6. 親から開く経路は既存の `authorized && activePage === "events"` を条件にする。静的URL自体は認証保護しないため、そこに個人情報は入れない。認証Cookie、Worker API、D1保存、ホームの演出方式は変更しない。

## 素材と演出

- 立ち絵（既存画像）：`/assets/shiori/gim/v1/shiori-home-training-bust-v1.webp`（800x1067）。
- 背景（既存画像）：`/assets/backgrounds/gym-day.webp` および `gym-night.webp`。
- Monogatari標準アクション：`show/hide character`、`show scene`、`wait`、セリフ、`Choice`、`jump`。フェードと左右位置移動をエンジンで行う。
- 小さな近接（1.04倍）・後退（0.96倍）・傾き（3°）はCSSとMonogatariのFunctionアクションで補う。最小のカスタマイズに留め、独自のシナリオエンジンは実装しない。
- 主人公の地の文と発言は表示しない。試作の会話は将来の正式なストーリー設定として採用しない。
- `sprites.normal` のみ登録。今後の表情はMonogatariの同じ`sprites`辞書へ拡張可能。
- CSSは縦持ち・狭幅優先。タッチ幅48px、画面端安全余白、`prefers-reduced-motion`のモーション抑止。

## 検証マトリクス（静的と実動作を区別）

| 確認対象 | このコミット時点の静的確認 | ブラウザ実動作 |
|---|---|---|
| Monogatari依存の固定・MIT・画像参照 | コード・パス・ライセンス照合対象 | 初回取得時間未測定 |
| 既存イベントテスト保持・追加入口 | HTML・JSの差分確認対象 | 実機タップ未確認 |
| iframe独立・Service Worker等無効 | 構造・オプション確認対象 | 実起動・ブラウザ仕様未確認 |
| フェード、左右移動、距離・傾き、暗転 | Script/CSSと公式アクション構文照合対象 | 視覚の大きさと輪郭は未確認 |
| 待機中の連打と選択肢の誤進行 | Monogatari標準Wait/Choiceを使用 | Android・連打負荷テスト未確認 |
| 終了、ブラウザ戻り、再入場 | 親のイベントハンドラ確認対象 | 各ブラウザ履歴・フォーカス未確認 |
| 既存認証、D1記録保存 | Worker/API/migrationsの変更なし | 本番認証・D1書込み未実施 |
| reduced-motion | JS設定/CSSメディアクエリあり | Android省アニメモード実確認未実施 |

**評価：導入試作のみ。** Monogatariは分岐・進行・場面変換を既製の語彙で表現できるが、エンジン本体が非圧縮で約2.82MBあり、kintoreappの日常的な対面会話に対して標準UIの改変と起動コストが大きい可能性がある。正式採用は既存「テスト」とのブラウザ比較が完了するまで保留。必要ならGSAP + 既存会話UIを比較する。
