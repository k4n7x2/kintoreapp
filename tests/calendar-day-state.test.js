import test from "node:test";
import assert from "node:assert/strict";
import {resolveDayPlan,dayPlanKind} from "../src/calendar-day-state.js";

const effective = (options) => {
  const day=resolveDayPlan(options);
  return [dayPlanKind(day),day.source];
};

test("one effective state even when manual, weekly and snapshots overlap",()=>{
  assert.deepEqual(effective({manual:{planned:1,rest:0},legacyRecurring:true,
    repeat:{kind:"gym"}}),["gym","manual"]);
  assert.deepEqual(effective({manual:{planned:0,rest:1},legacyRecurring:true,
    repeat:{kind:"gym"}}),["rest","manual"]);
});
test("per-date exclusions defeat both weekly rule engines",()=>{
  assert.deepEqual(effective({legacyOverride:0,legacyRecurring:true,
    repeat:{kind:"gym"}}),["none","exception"]);
  assert.deepEqual(effective({legacyOverride:0,legacyRecurring:false,
    repeat:{kind:"rest"}}),["none","exception"]);
});
test("explicit one-off gym defeats an otherwise recurring rest day",()=>{
  assert.deepEqual(effective({legacyOverride:1,repeat:{kind:"rest"}}),["gym","exception"]);
});
test("snapshot recurring rest/gym defeats old weekday-only recurrence",()=>{
  assert.deepEqual(effective({legacyRecurring:true,repeat:{kind:"rest"}}),["rest","repeat"]);
  assert.deepEqual(effective({legacyRecurring:true,repeat:{kind:"gym"}}),["gym","repeat"]);
});
test("legacy only and unset date remain backwards-compatible",()=>{
  assert.deepEqual(effective({legacyRecurring:true}),["gym","legacy"]);
  assert.deepEqual(effective({}),["none","none"]);
});
