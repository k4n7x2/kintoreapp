import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRecordChange as classify, calendarConditionGroups as calendar, savedNumericSnapshot as snapshot } from "../public/record-dialogue-rules.js";

const kg = (weight, reps, n = 1) => ({ set_number:n, entry_unit:"kg_reps", weight_kg:weight, reps, performed_on:"2026-10-01" });
const rep = (reps, n=1) => ({ set_number:n, entry_unit:"reps", reps, performed_on:"2026-10-01" });
const sec = (duration_seconds, n=1) => ({ set_number:n, entry_unit:"seconds", duration_seconds, performed_on:"2026-10-01" });
const run = (unit, sets, previousSets) => classify({ unit, sets, previousSets, performedOn:"2026-10-17" });
const expect = (title, unit, sets, previous, category) =>
  test(title, () => assert.equal(run(unit,sets,previous), "record." + category));
const c = (weight_kg,reps) => ({weight_kg,reps});
expect("weight up 40->42.5", "kg_reps", [c(42.5,10)], [kg(40,10)], "weight_up");
expect("weight down", "kg_reps", [c(35,10)], [kg(40,10)], "weight_down");
expect("reps up kg", "kg_reps", [c(40,11)], [kg(40,10)], "reps_up");
expect("reps down kg", "kg_reps", [c(40,9)], [kg(40,10)], "reps_down");
expect("both up", "kg_reps", [c(42.5,11)], [kg(40,10)], "both_up");
expect("both down", "kg_reps", [c(37.5,9)], [kg(40,10)], "both_down");
expect("weight up reps down", "kg_reps", [c(42.5,9)], [kg(40,10)], "weight_up_reps_down");
expect("weight down reps up", "kg_reps", [c(37.5,11)], [kg(40,10)], "weight_down_reps_up");
expect("reps-only up", "reps", [{reps:16}], [rep(15)], "reps_up");
expect("reps-only down", "reps", [{reps:14}], [rep(15)], "reps_down");
expect("seconds up", "seconds", [{duration_seconds:65}], [sec(60)], "seconds_up");
expect("seconds down", "seconds", [{duration_seconds:55}], [sec(60)], "seconds_down");
expect("all sets identical", "kg_reps", [c(40,10),c(42.5,8)], [kg(40,10),kg(42.5,8,2)], "unchanged");
expect("partial weight up without decrease", "kg_reps", [c(42.5,10),c(40,10)], [kg(40,10),kg(40,10,2)], "weight_up");
expect("partial reps down without increase", "kg_reps", [c(40,10),c(40,9)], [kg(40,10),kg(40,10,2)], "reps_down");
expect("mixed weight directions", "kg_reps", [c(45,10),c(35,10)], [kg(40,10),kg(40,10,2)], "saved_general");
expect("mixed reps directions", "kg_reps", [c(40,11),c(40,9)], [kg(40,10),kg(40,10,2)], "saved_general");
expect("mixed seconds directions", "seconds", [{duration_seconds:70},{duration_seconds:50}], [sec(60),sec(60,2)], "saved_general");
expect("different set counts", "kg_reps", [c(45,10),c(40,10)], [kg(40,10)], "saved_general");
expect("no previous record", "kg_reps", [c(45,10)], [], "no_comparison");
expect("failed API represented by null", "kg_reps", [c(45,10)], null, "no_comparison");
expect("other recorded unit", "kg_reps", [c(45,10)], [rep(10)], "no_comparison");
expect("partly incompatible units", "kg_reps", [c(45,10),c(45,10)], [kg(40,10),rep(10,2)], "no_comparison");
expect("missing set number", "kg_reps", [c(45,10),c(45,10)], [kg(40,10),kg(40,10)], "no_comparison");
expect("missing weight", "kg_reps", [c(45,10)], [{set_number:1,entry_unit:"kg_reps",reps:10,performed_on:"2026-10-01"}], "no_comparison");
expect("nonfinite weight", "kg_reps", [c(Infinity,10)], [kg(40,10)], "no_comparison");
expect("same-day history excluded", "kg_reps", [c(45,10)], [{...kg(40,10),performed_on:"2026-10-17"}], "no_comparison");
expect("future history excluded", "kg_reps", [c(45,10)], [{...kg(40,10),performed_on:"2026-10-19"}], "no_comparison");
expect("multiple coherent sets", "kg_reps", [c(45,11),c(42.5,8),c(35,10)], [kg(40,10),kg(42.5,7,2),kg(35,10,3)], "both_up");
test("saved snapshot is numeric only", () => assert.equal(snapshot("kg_reps", [c(42.5,10)]), snapshot("kg_reps", [c(42.5,10)])));
const state = (over={}) => ({ month:"2026-10", localMonth:"2026-10", recordsKnown:true, calendarKnown:true, hasPlan:false, hasAttendance:false, hasWorkout:false, ...over });
test("calendar empty when all fetched and zero", () => assert.deepEqual(calendar(state()), ["calendar.empty_month"]));
test("calendar full: individual states", () => assert.deepEqual(calendar(state({hasPlan:true,hasAttendance:true,hasWorkout:true})),
  ["calendar.has_plan","calendar.has_attendance","calendar.has_workout"]));
test("calendar plan only", () => assert.deepEqual(calendar(state({hasPlan:true})), ["calendar.has_plan"]));
test("calendar attendance only", () => assert.deepEqual(calendar(state({hasAttendance:true})), ["calendar.has_attendance"]));
test("calendar workout only", () => assert.deepEqual(calendar(state({hasWorkout:true})), ["calendar.has_workout"]));
test("calendar fetch failure is not empty", () => assert.deepEqual(calendar(state({calendarKnown:false})), []));
test("record fetch failure is not empty", () => assert.deepEqual(calendar(state({recordsKnown:false})), []));
test("truncated listing is not empty", () => assert.deepEqual(calendar(state({truncated:true})), []));
test("past month can be selected while data unknown", () => assert.deepEqual(calendar(state({month:"2026-09",calendarKnown:false,recordsKnown:false})), ["calendar.past_month"]));
test("future month can be selected while data unknown", () => assert.deepEqual(calendar(state({month:"2026-11",calendarKnown:false,recordsKnown:false})), ["calendar.future_month"]));
test("current month is neither past nor future", () => assert.deepEqual(calendar(state({month:"2026-10",hasPlan:true})), ["calendar.has_plan"]));

test("12 full sets compare when not truncated", () => {
 const present=Array.from({length:12},()=>c(45,10));
 const before=Array.from({length:12},(_,i)=>kg(40,10,i+1));
 assert.equal(run("kg_reps",present,before),"record.weight_up");
});
test("13 old sets never match a 12-set record", () => {
 const present=Array.from({length:12},()=>c(45,10));
 const before=Array.from({length:13},(_,i)=>kg(40,10,i+1));
 assert.equal(run("kg_reps",present,before),"record.no_comparison");
});
