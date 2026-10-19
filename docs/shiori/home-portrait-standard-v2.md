# 朝倉栞｜Home Portrait Standard v2 — 1086×1448 統一制作規格案

> **現行の基準方針：私服5表情を1つの参照セットにする（ユーザー選定済み）。**  
> **校正状態：未完了／規格v2の正式採用・アプリ本番への切替は未完了。**  
> 数値管理：[v2規格JSON](home-portrait-standard-v2.json)／[私服5枚のSHA固定JSON](home-portrait-v2-private-reference-family.json)／[基準変更の判断記録](home-portrait-v2-private-baseline-decision.md)。  
> 旧[正式v1](home-portrait-standard-v1.json)は保持し、画像・CSS・本番実装はこのPRでは変更しない。

## 1. v2の対象と新しい主参照

ホーム画面で使う、通常頭身の近接バストアップ立ち絵の衣装・表情差分が対象。SD、イベント一枚絵、全身設定画、背景は別仕様。

**一次参照セット：以下の私服5枚すべて（1086×1448px・透過WebP）**。

| 表情 | 参照パス |
|---|---|
| **normal（配置・大きさの代表）** | `public/assets/shiori/home/v2/shiori-private-home-normal-r1.webp` |
| thinking | `public/assets/shiori/home/v2/shiori-private-home-thinking-r1.webp` |
| surprised | `public/assets/shiori/home/v2/shiori-private-home-surprised-r1.webp` |
| smile | `public/assets/shiori/home/v2/shiori-private-home-smile-r1.webp` |
| playful | `public/assets/shiori/home/v2/shiori-private-home-playful-r1.webp` |

5枚を**均等な配置サンプル**として評価するが、配置の初期代表には`normal`を使う。残り4枚は**表情の自然な可動域・見た目の品質**を判断するための参照。**5枚全部が正式な顔座標合格を得た、という意味ではない。**

画像ハッシュ・GitHub main `f7148b56734f76faef386c97b4482c9c3e2f3508` での存在確認は[基準セットJSON](home-portrait-v2-private-reference-family.json)に記録。元画像の再描画や登録先変更はしない。画像制作ツールへの実参照入力は制作時に別途確認が必要（URL掲載やGitHub実体の存在だけでは成功しない）。

従来のジム用`smile-alt1`（SHA-256 `47804149850a46b41767c66eeff459260369d3bc6e5ae897d3b2004bff5bbdf1`、旧添付`11621.webp`）は**過去のv2構図試作資料**として保持。現行の一次位置合わせ基準には使用しない。[STEP 2の旧基準監査](home-portrait-v2-existing-audit.md)／[STEP 4](home-portrait-v2-step4-landmarks.md)／[STEP 5](home-portrait-v2-step5-review.md)は当時の基準による履歴であり、書き換えない。

## 2. 正式人物資料との分担

- 顔・瞳・髪型・人物の同一性：`docs/shiori/reference/shiori-master-v1.jpg`
- 塗り・光・水彩の透明感：`docs/shiori/reference/shiori-style-fullbody-v1.jpg`
- 体型・全身バランス：`docs/shiori/reference/shiori-character-sheet-v1.jpg`
- 対象の服の構造：当該衣装の設定画またはユーザー採用デザイン
- ホーム用近接構図・頭部の見かけの大きさ・表情変化：**今回の私服5枚**

人物基準3枚と衣装資料の担当要素を入れ替えない。髪の毛先は`visual.md`で定める健康的なまとまりを優先。私服5枚の服を他の衣装へ流用する必要はない。

## 3. キャンバスと表示共通化

- **1086×1448px固定**。左上原点(0,0)、X右＋、Y下＋。制作原本は透過PNG、GitHub表示用コピーは**ロッシーWebP品質85・アルファ保持**。原本上書き・リサイズ・余白付け足しは禁止。
- **近接・約30度傾いた頭部**の構図を維持。表情による微細な輪郭変化を拒否せず、顔の見かけの大きさや画面での位置が飛ばないことを重視。
- 四辺への自然な描画接触は許容。v1の「左右10%以上の透明余白」をv2へ強制しない。不自然な切れや端の白縁／黒縁は目視検査する。
- 構図上は同一ポーズの肩・手・髪・衣装の連続性を基本とする。ただし衣装違いによる服の形の違いを顔の位置ずれと混同しない。

## 4. 表情変化を考慮した座標・品質検査

### 比較の際、固定候補とするもの

耳の付け根、前髪以外の髪の大局的輪郭、花飾りの取付位置、頭蓋の比較的動かない輪郭、同一ポーズなら肩・手の形と位置。**候補は複数を併用し、花飾りや毛束の再描画により固定点自体が変わり得ることも調べる。**

### 表情により変わるため固定点として自動PASS／FAIL判定に使わないもの

眉・まぶた上下・目の開口部中心・視線・瞳の色重心・口角・開口形状・歯・頬・表情に伴う自然な顎先変化。**驚きの開眼や笑顔の開口を座標エラーとして扱わない。**

旧試作のジム`smile`由来の「左眼(425,447)／右眼(585,355)／顎(594,587)」は[JSONの`geometry.legacyGymSmileUncalibrated`](home-portrait-standard-v2.json)へ退避。**現行`geometry.anchors`は空＝未測定**であり、旧値を新参照基準のPASS判定に流用しない。従来の「眼中点±6px／顎±8px」は未校正かつ表情依存のため、**新基準にそのまま適用しない**。

[STEP 5再注釈データ](home-portrait-v2-step5-blind-pass.json)は参考の一次目視値のみで、独立二重注釈ではない。私服5枚の全体傾向は比較的安定していたが、全画像が正式合格という意味ではない。

## 5. 検査と採用ゲート

1. 新しい私服5枚基準の画像それぞれの**実ファイル・ハッシュ照合**。制作時はChatGPTプロジェクト添付の実入力の可否を個別記録する。
2. 画像寸法・実透過・半透明輪郭・WebP出力の形式を機械検査する。
3. 表情領域を除外して、複数の頭部固定候補点と顔スケール・傾き・位置を検査する。まず**私服5枚間の自然なばらつき**を推定して許容誤差を決める。
4. 旧ジム5表情を**私服5枚の基準に対する比較対象**として再評価。表情の大小・口の形を誤差としない。
5. 目視で顔・髪・体型・衣装・輪郭の破綻がないか確認。Android画面幅320/360/393/430pxおよび短い画面で切替時の位置・吹き出しと干渉を確認。
6. 採用判断・GitHub登録・アプリ組込み・本番デプロイ・実機検証を分けて記録する。

[検査プログラム](../../scripts/check_home_portrait_v2.py)／[テスト](../../tests/test_check_home_portrait_v2.py)／[GitHub Actions](../../.github/workflows/home-portrait-v2-qa.yml)は導入済み。ただし**現行の顔固定点はまだ校正されていない**ため、検査器は正式な幾何学的PASSを返してはならない。画像から自動で眼や顎の輪郭点を検出する仕組みでもない。開発時の`--allow-provisional`は診断専用。

`/home/v2/`・`private-v2` は既存**衣装ID**、`home-portrait-v2-trial` は**画像規格ID**。表記だけで合格済み素材と扱わない。

## 6. v1・従来実装との境界

旧正式v1は941×1672で部屋着に用いられている。ジム・私服は1086×1448だが、**今回ユーザーが基準に選んだのは私服5枚のみ**。ジムや部屋着へ直ちに画像修正／CSS補正／本番切替を実行しない。

**次の作業**：私服5枚の安定した頭部固定点の実測と再現性の確認、ジム5枚との表情考慮比較、その後のAndroid表示検査。独立レビュー前に`status: calibrated`へ昇格しない。
