import test from "node:test";
import assert from "node:assert/strict";
import { resolveCalendarIcon } from "../public/calendar-status.js";

test("未設定日・来館のみの日は無印", () => {
  assert.equal(resolveCalendarIcon(), "none");
  assert.equal(resolveCalendarIcon({ attended: true }), "none");
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
