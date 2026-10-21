# 朝倉栞 — キャラクター資料の入口

このディレクトリは、筋トレアプリ`kintoreapp`の朝倉栞の正式資料を管理する。プロジェクトを分けても正本はGitHubの最新mainに一本化する。分担・登録資料・受け渡しは[共通案内](../project-guide.md)、貼り付け用の指示は[ビジュアル制作](../visual-production-instructions.md)と[セリフ・物語制作](../dialogue-production-instructions.md)を参照する。

## 表情差分プロンプトの作成（短い定型文を優先）

「表情差分のプロンプトを作って」「ジム用に3枚追加する指示文」など、**画像を作るのではなく依頼文を作成する**ときは、必ず [表情差分プロンプトの共通テンプレート](expression-variation-prompt-template.md) を使う。

- 親は同じチャットの通常立ち絵（実在を確認できたもの）。差分3枚なら、3枚とも**その同じ親画像から派生**する。
- **事前前提 → 基準画像 → 絶対に維持するもの → 変更してよい範囲 → 生成する表情**の短い構成を維持。枚数・衣装・既存表情・新しい表情の説明のみ具体化する。
- ユーザーが良好と評価した短い依頼文の密度を守り、長大な役割設定・座標計算・詳細監査ルールを勝手に追加しない。
- プロンプト作成の依頼では**画像を実行しない**。文書内の「生成」は画像制作の許可ではない。実際に画像を制作する場合は、明示的な別依頼が必要。

## 担当別に読む資料

作業前に最新mainのSHAと適用規約を確認し、同じコミットの資料を読む。人物の確定・仮・未決定を維持し、他プロジェクトの会話や短い要約だけで再解釈しない。

| 作業 | 必須資料 | 条件に応じて追加 |
|---|---|---|
| 立ち絵・衣装・表情・人物の画像制作 | [character.md](character.md)、[visual.md](visual.md)、[dialogue.md](dialogue.md)、[character-sheet-spec.md](character-sheet-spec.md)、[reference-audit.md](reference-audit.md)、正式基準3枚 | 対象衣装の設定画、採用済みの差分元 |
| 背景制作 | `character.md`、`visual.md`、対象シーンの[背景素材](../../public/assets/backgrounds/)と構成一覧 | 前景の立ち絵・UI。人物を描く場合は上段の基準も確認 |
| セリフ・物語・プロフィール | `character.md`、`dialogue.md`、対象の[既存本文](../../public/data/) | 外見・衣装・表情を扱う場合は`visual.md`と対応資料。採用エピソードがあればその本文 |
| アプリのキャラ表示・演出・素材組み込み | `character.md`、変更対象に応じた`visual.md`／`dialogue.md`、受け渡された採用物、[実装状況](../implementation-status.md)とコード | 画像を制作・変更する場合は人物制作の資料一式 |

画像制作は、制作・編集の明示的な依頼に「生成」という語がある場合だけ実行する。引用文や生成用プロンプトの作成依頼は許可に含めない。

## 正式画像とプロジェクト添付

| 正式画像 | 主な担当要素 |
|---|---|
| [shiori-master-v1.jpg](reference/shiori-master-v1.jpg) | 顔・瞳・表情・同一人物性 |
| [shiori-style-fullbody-v1.jpg](reference/shiori-style-fullbody-v1.jpg) | 塗り・光・水彩の透明感 |
| [shiori-character-sheet-v1.jpg](reference/shiori-character-sheet-v1.jpg) | 体型・三面図・標準私服 |
| [shiori-training-outfit-v1.jpg](reference/shiori-training-outfit-v1.jpg) | トレーニング衣装A |
| [shiori-training-outfit-v2.jpg](reference/shiori-training-outfit-v2.jpg) | トレーニング衣装B（Aとは別衣装） |
| [shiori-roomwear-outfit-v1.png](reference/shiori-roomwear-outfit-v1.png) | 部屋着・眼鏡・室内履き |

要素ごとの優先順位・毛先条件・検査・形式・制作手順は[visual.md](visual.md)が正本。画像内の文字だけで年齢等の人物設定を変えない。

### ChatGPTプロジェクト内の基準画像の利用

GitHubは正式画像の管理先。プロジェクトのソースは、画像制作ツールへ入力するためにアップロードする実ファイルであり、自動同期されない。現在の正式画像6枚を取得して登録する。今回の添付との対応・描画差・識別用ハッシュは[reference-audit.md](reference-audit.md)を確認する。

存在確認、目視照合、ツールへの入力を分けて記録する。GitHub URL、ファイル名、ローカルパスの存在だけでは入力成功にならない。ツールが対応する入力方法を使用し、必要な入力を渡せない場合は該当ファイルと止まる工程を示す。過去の一時パスを再利用せず、`docs/`をWorkersで配信していると仮定しない。

添付を読み取れない場合も、画像内容に依存しない文書整理・設計は進める。添付版の使用と正式版の更新は別の判断であり、差のある画像を無断で同じ版として扱わない。

## 主人公・関係性と会話形式

- 栞の一人暮らし・ジムまでの距離・運動との距離感・習慣化の悩み・週1回のチートデイは[character.md](character.md)第4節、小学生時代の二人・再会時の印象と関係の始まりは同第6節を参照する。

- [character.md](character.md)の「主人公と二人の関係」に、最小限の主人公設定と、幼馴染→主人公の引っ越しで疎遠→栞も偶然近くへ転居→同じジムで再会する確定経緯を記載する。
- [dialogue.md](dialogue.md)に、主人公の通常セリフを表示せず、ときどき選択肢で意思を示す制作方針を記載する。会話見本の「こちら」は制作上の反応例として読む。
- 再会後は今のお互いを知り直し、日常の関わりを通じて仲を深める。個別の過去エピソード・恋愛関係・同居等は、この共通設定から自動的に確定しない。
- 以上は物語設定・制作方針の採用であり、再会イベント、選択肢、分岐、関係進行がアプリへ実装されたことを意味しない。

## 長編ストーリーの制作資料

長編イベントは **原作台本 → ゲーム用演出台本 → 実装用データ** の順で制作する。原作は地の文を保ち、ゲーム用には栞のセリフと必要な選択肢を中心に、背景・表情・間などへ翻案する。詳細ルールは [セリフ・物語制作指示](../dialogue-production-instructions.md) と [dialogue.md](dialogue.md) を参照。

- **第1話「久しぶり、はじめまして。」原作台本 v1**：[stories/episode-01-reunion/original.md](stories/episode-01-reunion/original.md) — 初稿を保管。完成版の採用・全場面の正史化・アプリ実装は未実施。
- **第1話「久しぶり、はじめまして。」ゲーム用演出台本 v1.1**：[stories/episode-01-reunion/game-script.md](stories/episode-01-reunion/game-script.md) — 再会前は敬語、正体判明後はタメ口に切り替わる制作基準版として登録。素材追加・Monogatari本編実装・イベント進行保存は未実施。原作の最終採用や新しい過去・出来事の正史化とは区別する。
- 原作台本で創作した台詞や出来事は、[character.md](character.md) の採用済み設定と区別し、採用指示なしに追加の正史として登録しない。

## 正本の更新と採用物の所在

- 人物像・設定の確定は`character.md`、外見・主参照・画像仕様は`visual.md`、口調・会話規則は`dialogue.md`、三面図・体型・標準私服の制作仕様は`character-sheet-spec.md`を更新する。
- 表示用人物画像は`public/assets/shiori/{home|gim|town|College}/{v1|v2|…}/`で場所→衣装ごとに管理する。衣装ID・命名・登録先の正本は[visual.md第6節](visual.md)。
- 表示用画像は[public/assets/shiori/](../../public/assets/shiori/)、背景は[public/assets/backgrounds/](../../public/assets/backgrounds/)、固定セリフは[public/data/](../../public/data/)に置く。制作資料画像をそのまま透過立ち絵として流用しない。
- 現在接続されている素材・本文と、候補のままのデータは[実装状況](../implementation-status.md)で区別する。ファイルの存在だけで採用・実装・本番確認を断定しない。
- 本文や絵を制作しただけでは、新しい人物設定・過去の出来事・関係性は確定しない。ユーザーが採用した範囲だけを正本へ反映する。現時点で独立した正史・年表は未整備。継続エピソードの採用資料を設ける場合はここから案内する。
- 基準画像の改訂は旧版を残し、新しい版を登録して現行参照を更新する。詳細設定を各プロジェクトの指示へ複写せず、担当文書を保守する。
