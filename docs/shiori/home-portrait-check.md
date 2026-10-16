# Home Portrait Standard v1 — 計測・登録前検査

正本は [visual.md §8.2.2](visual.md) と [共通座標JSON](home-portrait-standard-v1.json)。対象は**新たに制作するホーム表示用の通常頭身・透過立ち絵**。既存8枚のWebPはレガシー素材として保持し、無断で移動・差替えしない。一枚絵・SD絵には適用しない。

## 基準データの現状

2026-10-16の承認済み画面に対応する Android スクリーンショット2枚（691×1536）と、GitHubのトレーニング用WebP・部屋着「喜」WebPの実画像を照合した。スクリーンショットの**概算画面座標**と、部屋着「喜」の**暫定画像座標**をJSONに記録した。画面内座標はブラウザCSS・画像サイズ変更・transformの適用後の値で、原画像内座標とは一致しない。

- **status: provisional**：画面上の位置合わせに参考として使えるが、±4pxの厳格な基準アンカーを実測確定したことにはならない。現状での新素材の自動合格は禁止。既存表示の変化を防ぐためこの状態を維持する。
- **完了条件**：承認済み画面の表示寸法・transformを実際に取得し、部屋着「喜」ソース画像の目・頭頂・顎・肩を**ピクセル座標でクリック注釈**して確認する。JSONのanchorsとreferenceを確定したうえでレビューし、初めてstatusをcalibratedにする。既存の7表情全体が合格したとみなさない。
- 実画像はGitHubのpublic/assets/shiori/にある。制作資料JPEG/PNGとの同一視は禁止。承認済みスクリーンショットの**バイト列・通知表示**は公開リポジトリへ保存しない。

## 新素材の登録前の実行手順

1. 通常ホーム用画像を**941×1672px**の透過PNGで制作する。顔・塗り・体型・衣装は通常の正式参照に従う。
2. 完成した画像上で、eyeCenter（左右の目の外形中心の中点）、headTopY、chinY を計測し、必要なら肩の座標も測る。これらは**画像内の座標**であり、スクリーンショット上の座標を転記しない。
3. 原本の横に画像名＋.anchors.json のサイドカーを置く。例：new-image.png.anchors.json。人間が画像と照合して初めてreviewed: trueにする。

\`\`\`json
{
  "standard": "home-portrait-v1",
  "reviewed": true,
  "samePoseAsReference": false,
  "anchors": {
    "eyeCenter": [460, 328],
    "headTopY": 22,
    "chinY": 455
  }
}
\`\`\`

数値は**暫定例**であり、新しい画像を測らずコピーすることは禁止。立ち絵の姿勢が参照画像と完全に同じ場合はsamePoseAsReference: trueとしてleftShoulder、rightShoulderも記載する。

4. Pillow を用意して検査する。

\`\`\`bash
python -m pip install Pillow
python scripts/check_home_portrait.py /path/to/new-image.png
\`\`\`

5. 必須検査に合格したらWebP品質85の別コピーへ変換し、同じ寸法・透明余白・アンカーを維持したことを再検査してからGitHubへ登録する。GitHub Actionsは**PRで新規に追加するホーム立ち絵**を対象にチェックする。もともとのレガシー画像・一枚絵・SD絵は対象外。顔の同一性、毛先、手指、透過縁、表示画面での見え方は引き続き人間による検査が必要。

### 試行時の注意

status: provisionalの間は通常の検査が失敗する。--allow-provisionalは検査器の**開発診断専用**であり、本採用・GitHub Actionsでは使用しない。これは検査漏れを合格と誤認しないための仕組み。

**スクリプトが目の位置を画像から自動検出するわけではない。** 人手による実測・注釈と、自動の寸法／アルファ／透明余白／座標差計算を組み合わせる。顔以外の線画の同一性や下端の自然な見切れについては別途目視する。
