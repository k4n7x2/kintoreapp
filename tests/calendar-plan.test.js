import test from "node:test";
import assert from "node:assert/strict";
import { weekdaysToMask, maskToWeekdays, previousISODate, calendarWeekday,
  recurringOn, effectivePlan } from "../src/calendar-plan.js";

test("multiple weekdays and Sunday", () => {
  assert.equal(weekdaysToMask([2, 3, 5]), 22);
  assert.deepEqual(maskToWeekdays(22), [2, 3, 5]);
  assert.equal(calendarWeekday("2026-10-18"), 7);
  assert.equal(calendarWeekday("2026-10-20"), 2);
});
test("reject malformed weekday selections", () => {
  for (const value of [[], [2,2], [0], [8], ["2"], null]) assert.equal(weekdaysToMask(value), null);
});
test("valid date-boundaries for recurrence", () => {
  const rules = [{ start_on: "2026-10-20", end_on: "2026-11-03", weekdays_mask: 22 }];
  assert.equal(recurringOn("2026-10-19", rules), false);
  assert.equal(recurringOn("2026-10-20", rules), true);
  assert.equal(recurringOn("2026-10-21", rules), true);
  assert.equal(recurringOn("2026-10-22", rules), false);
  assert.equal(recurringOn("2026-11-03", rules), true);
  assert.equal(recurringOn("2026-11-04", rules), false);
});
test("exception precedence, even for legacy one-time flags", () => {
  const rules = [{ start_on: "2026-10-18", end_on: null, weekdays_mask: 22 }];
  assert.equal(effectivePlan("2026-10-20", false, rules), true);
  assert.equal(effectivePlan("2026-10-20", false, rules, 0), false);
  assert.equal(effectivePlan("2026-10-20", true, rules, 0), false);
  assert.equal(effectivePlan("2026-10-22", false, rules, 1), true);
  assert.equal(effectivePlan("2026-10-22", true, [], null), true);
});
test("year turn and leap-day split", () => {
  assert.equal(previousISODate("2027-01-01"), "2026-12-31");
  assert.equal(previousISODate("2028-03-01"), "2028-02-29");
});
