import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildAnalysisTrend} from "../public/analysis-chart.js";
const s=(date,weight,reps,rest={})=>({performed_on:date,weight_kg:weight,reps,is_completed:1,entry_unit:"kg_reps",...rest});
test("completed max weight pairs with reps from the same set",()=>{
  assert.deepEqual(buildAnalysisTrend([s("2026-10-03",40,12),s("2026-10-03",45,8),s("2026-10-03",45,9),s("2026-10-03",50,15,{is_completed:0}),s("2026-10-02",35,10)],"all"),[
    {date:"2026-10-02",weight:35,reps:10},{date:"2026-10-03",weight:45,reps:9}
  ]);
});
test("legacy completed and decimals are kept; other units and unchecked excluded",()=>{
  assert.deepEqual(buildAnalysisTrend([s("2026-10-13",10,8,{is_completed:"0"}),s("2026-10-13",0,10,{entry_unit:"reps"}),{performed_on:"2026-10-11",weight_kg:12.5,reps:14}],"all"),
    [{date:"2026-10-11",weight:12.5,reps:14}]);
});
test("one calendar month clamps leap-day boundaries",()=>{
  assert.deepEqual(buildAnalysisTrend([s("2026-02-27",30,10),s("2026-02-28",30,11),s("2026-03-31",35,9)],"1m","2026-03-31").map(p=>p.date),["2026-02-28","2026-03-31"]);
});
test("screen keeps history editing and SD region",()=>{
  const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  assert.match(app,/renderAnalysisTrend\(/);
  assert.match(app,/openAnalysisRecord\(name, date\)/);
  assert.match(html,/id="analysis-chart-canvas"/);
  assert.match(html,/analysis-sd-space sd-page-companion/);
});
