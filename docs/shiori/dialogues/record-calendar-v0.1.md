# 朝倉栞｜記録・カレンダー画面専用セリフ v0.1

- **段階**：初稿候補（本文未採用／GitHub資料として登録済み／アプリ未実装）
- **確認したmain**：`6d8c2b7e0b57cc3c55f4fcd865bfa7fdf5c965f7`（2026-10-17）
- **制作根拠**：`docs/dialogue-production-instructions.md`、`docs/shiori/README.md`、`docs/shiori/character.md`、`docs/shiori/dialogue.md`、`public/data/shiori-greetings.json`、`docs/implementation-status.md` と `public/app.js`・`src/index.js`
- **収録数**：115本／21条件グループ
- **人物設定への影響**：なし。新たな過去・約束・恋愛関係を追加しない。
- **用途**：記録画面・カレンダー画面のSD栞吹き出し。個人の実データや会話履歴は収録しない。
- **画像指定**：なし。現行のSD画像を流用することを想定。表情差分への自動連動は別実装。

## 表示制御の提案（実装前提ではない）

1. **通常セリフ**：画面遷移または吹き出しタップで抽選。直前のセリフは候補がある限り避ける。画面ごとに独立した候補集合にする。
2. **保存リアクション**：`PUT /api/exercises/log` の成功応答を受けて初めて表示。保存失敗時には発話しない。既に保存済みの同じ入力を再保存した場合は数値変化扱いにしない。保存時の吹き出しは別の非同期抽選で即座に上書きしない。
3. **前回の比較**：選択した記録日より厳密に前の日付にある、同名種目・同じ記録単位の最新記録だけを対象。対応するセット番号ごとに重量・回数・秒数を比較し、同じ向きの変化が一貫している場合だけ数値に言及する。セット増減・相反する変化・データ未取得・取得失敗などは一般保存へフォールバック。
4. **上がった／下がった**：価値判断ではなく数値変化を示す。「重量が下がったから退歩」「秒数が伸びたから優秀」とは言わない。セット数が異なる場合に推定で褒めない。
5. **カレンダー条件**：表示中の月と取得成功した当該月のデータで判定。読み込み失敗や未取得を「予定ゼロ」とは解釈しない。日付タップで記録画面へ移動する現行導線を維持する。
6. **抽選例**：通常時は通常セリフ中心、条件成立時は文脈セリフを一定確率で採用。保存成功時は文脈セリフを優先。抽選率はUI試作で調整する。

## セリフ本文

### `record.normal` — 記録画面・通常（18本）

**表示条件**：画面を開いた時／吹き出しタップ。実績未取得でも安全な発話。

- `record.normal.01` どの種目から確認する？
- `record.normal.02` あ、記録つけるんだね。
- `record.normal.03` 前の記録があると、比べるのも面白そう。
- `record.normal.04` 記録を並べると、違いが見えて面白いね。
- `record.normal.05` 記録って、後から見ると意外と面白いよね。
- `record.normal.06` 私、数字を見るとつい比べちゃう。
- `record.normal.07` どの種目を見てるの？
- `record.normal.08` 書き残しておくと、忘れずに済むね。
- `record.normal.09` メモも残しておく？
- `record.normal.10` 同じ種目でも、毎回同じにはならないよね。
- `record.normal.11` 一つずつ見ていこうか。
- `record.normal.12` ん、何か気になるところあった？
- `record.normal.13` 一回ごとに違いが出ることもあるよね。
- `record.normal.14` ここ、前の記録も見られるんだね。
- `record.normal.15` 数字だけじゃ分からないことも、あるよね。
- `record.normal.16` 無理に前回を超えなくてもいいと思うよ。
- `record.normal.17` 休むのも、ちゃんと選択肢の一つだよね。
- `record.normal.18` 私はこういうの見てると、つい時間を忘れそう。

### `record.saved_general` — 記録画面・保存成功（一般）（8本）

**表示条件**：記録保存のAPI成功時。前回比較の成否を問わず利用できる。

- `record.saved_general.01` うん、保存できたね。
- `record.saved_general.02` あ、記録できた。
- `record.saved_general.03` これで後から見返せるね。
- `record.saved_general.04` ひとまず、ひと区切りだね。
- `record.saved_general.05` お疲れさま。記録、残せたね。
- `record.saved_general.06` こうして一つずつ残していくんだね。
- `record.saved_general.07` ちゃんと残ったね。よかった。
- `record.saved_general.08` うん、記録しておこう。

### `record.weight_up` — 重量増（7本）

**表示条件**：同単位kg_repsで、比較対象の共通セットの重量に増加があり、重量減・回数差・セット数差がない。

- `record.weight_up.01` あ、前より重くなってるね。
- `record.weight_up.02` 重量、上げたんだね。
- `record.weight_up.03` この種目、前回より重いね。
- `record.weight_up.04` ん、重量が増えてる。
- `record.weight_up.05` 前回と比べると、重さが違うね。
- `record.weight_up.06` お、重くしてる。
- `record.weight_up.07` ちょっと待って。重量、上がってない？

### `record.weight_down` — 重量減（7本）

**表示条件**：同単位kg_repsで、共通セットの重量に減少があり、重量増・回数差・セット数差がない。意図や失敗を断定しない。

- `record.weight_down.01` 今回は前より軽めなんだね。
- `record.weight_down.02` ん、重量を下げてるんだ。
- `record.weight_down.03` 前回より軽い重量だね。
- `record.weight_down.04` 前回とは重さを変えたんだね。
- `record.weight_down.05` 今回はこっちの重量なんだ。
- `record.weight_down.06` 軽くしたんだね。何か試してるのかな。
- `record.weight_down.07` あ、前回より軽いね。

### `record.reps_up` — 回数増（7本）

**表示条件**：単位repsまたはkg_repsで、共通セットの回数に増加があり、回数減・重量差・セット数差がない。

- `record.reps_up.01` 回数、前より増えてるね。
- `record.reps_up.02` あ、今回は回数を増やしたんだ。
- `record.reps_up.03` 前回より多く記録してるね。
- `record.reps_up.04` もう少し回数やってるんだね。
- `record.reps_up.05` ん、前回より回数が多い。
- `record.reps_up.06` 回数が増えたの、記録で分かるね。
- `record.reps_up.07` お、回数が伸びてる。

### `record.reps_down` — 回数減（7本）

**表示条件**：単位repsまたはkg_repsで、共通セットの回数に減少があり、回数増・重量差・セット数差がない。

- `record.reps_down.01` 今回は回数を少なめにしたんだね。
- `record.reps_down.02` 回数は前回より少ないね。
- `record.reps_down.03` ん、今回は回数を変えたんだね。
- `record.reps_down.04` 今回は回数を抑えてるんだ。
- `record.reps_down.05` 回数を減らしてるね。何か理由があるのかな。
- `record.reps_down.06` 前回とは違う組み方なんだね。
- `record.reps_down.07` ここは回数を抑えてるんだね。

### `record.seconds_up` — 秒数増（4本）

**表示条件**：単位secondsで、共通セットの秒数に増加があり、減少・セット数差がない。成長の価値判断はしない。

- `record.seconds_up.01` 秒数、前より長くなってるね。
- `record.seconds_up.02` 今回は前より長く続けたんだね。
- `record.seconds_up.03` ん、時間を延ばしたんだ。
- `record.seconds_up.04` 記録を比べると、秒数が増えてる。

### `record.seconds_down` — 秒数減（4本）

**表示条件**：単位secondsで、共通セットの秒数に減少があり、増加・セット数差がない。

- `record.seconds_down.01` 今回は短めなんだね。
- `record.seconds_down.02` 前回より短い時間になってるね。
- `record.seconds_down.03` 時間を短くしたんだね。
- `record.seconds_down.04` 今回はこの長さにしたんだ。

### `record.both_up` — 重量と回数が共に増加（4本）

**表示条件**：単位kg_repsで、重量・回数とも増加があり、どちらにも減少がなく、セット数差がない。

- `record.both_up.01` 重さも回数も増えてるね。
- `record.both_up.02` あれ、両方上がってる。
- `record.both_up.03` ん、前回より重くて、回数も多いんだ。
- `record.both_up.04` これは変化が分かりやすいね。両方増えてる。

### `record.both_down` — 重量と回数が共に減少（2本）

**表示条件**：単位kg_repsで、重量・回数とも減少があり、どちらにも増加がなく、セット数差がない。

- `record.both_down.01` 重さも回数も、前回とは変えてるんだね。
- `record.both_down.02` 今回は両方、前回より少ないね。

### `record.weight_up_reps_down` — 重量増・回数減（2本）

**表示条件**：単位kg_repsで重量増・回数減、反対方向の変化・セット数差がない。

- `record.weight_up_reps_down.01` 今回は重さを上げて、回数を抑えてるんだね。
- `record.weight_up_reps_down.02` 重さは上がって、回数は少なくなってるね。

### `record.weight_down_reps_up` — 重量減・回数増（2本）

**表示条件**：単位kg_repsで重量減・回数増、反対方向の変化・セット数差がない。

- `record.weight_down_reps_up.01` 今回は重さを下げて、回数を増やしたんだね。
- `record.weight_down_reps_up.02` 軽めで、回数は多くなってるね。

### `record.unchanged` — 前回と同じ（4本）

**表示条件**：同一種目・同一単位で比較可能な全セットの値とセット数が一致する。

- `record.unchanged.01` 前回と同じ組み方だね。
- `record.unchanged.02` 数字は変えてないんだね。
- `record.unchanged.03` こういう記録も、残しておくといいよね。
- `record.unchanged.04` うん、前回と同じだね。

### `record.no_comparison` — 前回比較不可（4本）

**表示条件**：該当する過去記録なし／単位不一致／前回の取得失敗／セットの整合が取れない。初回と断定しない。

- `record.no_comparison.01` 今回は前回と比べられないみたい。
- `record.no_comparison.02` まずは、今回の記録を残しておこう。
- `record.no_comparison.03` この種目は、ここから変化を見ていこうか。
- `record.no_comparison.04` 記録できたね。次に見返すのが楽しみ。

### `calendar.normal` — カレンダー画面・通常（20本）

**表示条件**：月間表示時／吹き出しタップ。日付や記録を推定しない。

- `calendar.normal.01` 何か予定、確認してる？
- `calendar.normal.02` 予定を見てたところ？
- `calendar.normal.03` カレンダーって、つい先の予定まで見ちゃう。
- `calendar.normal.04` 私は休みの日を先に探しちゃうかも。
- `calendar.normal.05` 予定が空いてる日って、ちょっと嬉しいよね。
- `calendar.normal.06` 詰め込みすぎないのも大事だよね。
- `calendar.normal.07` 何もない日を作るのも、立派な予定かな。
- `calendar.normal.08` 私、予定を立てるのは結構好き。
- `calendar.normal.09` でも、予定通りに動けるかは別の話なんだよね。
- `calendar.normal.10` こうして見ると、一か月って案外短いね。
- `calendar.normal.11` 少し先のこと、考えてる？
- `calendar.normal.12` 先に楽しみがあると、嬉しいよね。
- `calendar.normal.13` ゲームの発売日だけは、忘れない気がする。
- `calendar.normal.14` 予定を考えてると、いつの間にか時間が経ってる。
- `calendar.normal.15` 私は気分で予定を変えたくなることもあるな。
- `calendar.normal.16` 予定のない日、何しようかな。
- `calendar.normal.17` 一人でのんびりする日も好き。
- `calendar.normal.18` ねえ、空いてる日って何することが多い？
- `calendar.normal.19` 先の予定って、考えるだけでちょっと楽しいね。
- `calendar.normal.20` ん、どの日を見てるの？

### `calendar.has_plan` — 表示月に予定あり（3本）

**表示条件**：選択して表示中の月に、予定フラグ付き日が1日以上ある。取得済みの場合だけ。

- `calendar.has_plan.01` あ、この月はジムの予定が入ってるね。
- `calendar.has_plan.02` 予定を入れておくと、見返しやすいね。
- `calendar.has_plan.03` ジムの予定、ここで確認できるんだね。

### `calendar.has_attendance` — 表示月に来館あり（3本）

**表示条件**：選択して表示中の月に、来館フラグ付き日が1日以上ある。取得済みの場合だけ。

- `calendar.has_attendance.01` この月は、ジムに行った日があるんだね。
- `calendar.has_attendance.02` あ、来館の印がついてる。
- `calendar.has_attendance.03` こうして見ると、行った日が分かるね。

### `calendar.has_workout` — 表示月に筋トレ記録あり（3本）

**表示条件**：選択して表示中の月に保存済み種目のある日が1日以上。取得済みの場合だけ。

- `calendar.has_workout.01` あ、この月は記録も残ってるんだ。
- `calendar.has_workout.02` 記録のある日、ここから見られるんだね。
- `calendar.has_workout.03` いつ何をしたか、後からたどれるね。

### `calendar.empty_month` — 表示月の3指標がすべてゼロ（2本）

**表示条件**：表示月の予定・来館・筋トレ記録が取得成功し、3種類ともゼロ。未取得をゼロ扱いしない。

- `calendar.empty_month.01` この月は、まだ印がないね。
- `calendar.empty_month.02` 予定が空いてる月って、なんだか静かだね。

### `calendar.past_month` — 過去の月を表示（2本）

**表示条件**：表示月が端末現地時刻の現在月より過去。年月比較だけでよく、個人記録は不要。

- `calendar.past_month.01` 前の月を見返してるんだね。
- `calendar.past_month.02` 振り返ると、いろいろ思い出すことあるよね。

### `calendar.future_month` — 未来の月を表示（2本）

**表示条件**：表示月が端末現地時刻の現在月より未来。年月比較だけでよく、個人記録は不要。

- `calendar.future_month.01` 先の月まで見てるんだ。
- `calendar.future_month.02` 少し先の予定を考えるのもいいね。

## 実装側への受け渡しと未対応範囲

- 既存実装では `public/app.js` の `showSideDialogue(page, reason)` が3画面で共通ホーム候補を抽選し、記録保存成功時には固定「そっか。頑張ったね。」を表示している。上記分類による条件判定は未実装。
- 既存 `/api/workouts/recent?name=...&before=...` には前回のセット比較に必要な情報があるが、保存済み当日レコード・同日再保存・単位変更・全セット増減の正確な分類処理は別途検証が必要。
- 現行カレンダーは日付をタップすると記録画面へ移動する。予定・来館の編集は記録画面側。カレンダーから新規登録したことを示すような台詞は含めない。
- 固定文言を GitHub に保存するときはユーザーが採用した本文のみ `public/data/` に登録し、実装のデータ構造は開発担当が既存コードと整合させる。個人データはコミットしない。
- **QA**：初稿の文字数・重複・条件付けを確認。実機の表示幅、吹き出しの折り返し、本人の声としての自然さは採用前の目視検査が必要。
