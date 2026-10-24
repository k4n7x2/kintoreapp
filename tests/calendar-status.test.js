import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCalendarIcon } from "../public/calendar-status.js";

test("未設定日は無印、来館記録のみの日も緑のダンベル", () => {
  assert.equal(resolveCalendarIcon(), "none");
  assert.equal(resolveCalendarIcon({ attended: true }), "attended");
});
test("予定と休息は異なる表示", () => {
  assert.equal(resolveCalendarIcon({ planned: true }), "planned");
  assert.equal(resolveCalendarIcon({ rest: true }), "rest");
});
test("筋トレ実績は予定・休息より優先する", () => {
  assert.equal(resolveCalendarIcon({ hasWorkout: true }), "workout");
  assert.equal(resolveCalendarIcon({ hasWorkout: true, planned: true, rest: true }), "workout");
});
test("不整合状態は予定優先で、未設定を休息扱いにしない", () => {
  assert.equal(resolveCalendarIcon({ planned: true, rest: true }), "planned");
  assert.equal(resolveCalendarIcon({ planned: false, rest: false }), "none");
});


test("緑のダンベルは来館登録時のみ（筋トレ実績だけでは緑にならない）", () => {
  assert.equal(resolveCalendarIcon({ hasWorkout: true, attended: false }), "workout");
  assert.equal(resolveCalendarIcon({ hasWorkout: true, planned: true, attended: false }), "workout");
  assert.equal(resolveCalendarIcon({ planned: true, attended: false }), "planned");
  assert.equal(resolveCalendarIcon({ hasWorkout: true, planned: true, attended: true }), "attended");
  assert.equal(resolveCalendarIcon({ attended: true, rest: true }), "attended");
});

test("カレンダーは独立した来館フラグで緑アイコンを出す", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(app, /attended: !!state\?\.attended/);
  assert.match(stylesheet, /\.calendar-day__status\.is-workout, [^{]+\{ color: var\(--accent\)/);
  assert.match(stylesheet, /\.calendar-day__status\.is-attended, [^{]+\{ color: var\(--success\)/);
  assert.match(page, /class="legend-icon is-attended"/);
});

test("日付の背景色は来館記録だけに連動し、筋トレ実績だけでは付かない", () => {
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(stylesheet, /#page-calendar \.calendar-day\.is-attended\s*\{\s*background:\s*var\(--completed\)/);
  assert.doesNotMatch(stylesheet, /#page-calendar \.calendar-day\.is-workout\s*\{[^}]*\bbackground(?:-color)?\s*:/);
  assert.match(app, /if \(state\?\.attended\) cell\.classList\.add\("is-attended"\)/);
});
