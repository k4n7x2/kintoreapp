# 朝倉栞・私服ホーム立ち絵 v2 試作素材（5表情）

GitHub保存依頼を受けて、画像を**試作素材として保管**したもの。既存のアプリ表示や正式人物設定を変更しない。元の透過PNGは会話内で保持し、GitHubにはロッシーWebP品質85で変換した別コピーを格納する。

| 表情 | ファイル |
|---|---|
| normal | [normal](./shiori-private-home-normal-r1.webp) |
| smile | [smile](./shiori-private-home-smile-r1.webp) |
| thinking | [thinking](./shiori-private-home-thinking-r1.webp) |
| surprised | [surprised](./shiori-private-home-surprised-r1.webp) |
| playful | [playful](./shiori-private-home-playful-r1.webp) |

- 5枚はすべて1086×1448px、RGBA/実アルファ保持WebP。原画像のトリム・リサイズはしていない。
- `smile` は笑顔を強くした最新の修正版を採用。5表情の比較は以前に作成した重ね比較画像を参考とする（smileは修正版を含む）。
- 個別の顔・顎位置の反復実測、髪固定方式の完全一致、端のノイズ・Android表示の最終監査はまだ行っていない。
- 場所→衣装の保存先は正式規則に従い、栞のいるシチュエーションを決めてから `public/assets/shiori/{home|gim|town|College}/{v1|v2|…}/` に別途登録する。現在のファイルは**正式表示用ディレクトリではない**。
- 既存の `public/assets/shiori/home/v1`（部屋着）および `gim/v1`（ジム）、Home Portrait Standard v1、PR #14の監査改修に手を加えない。

詳細な各ファイルのGit blob SHAとSHA-256は [manifest.json](./manifest.json) を参照。
