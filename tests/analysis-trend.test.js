import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildAnalysisDays,buildAnalysisMetrics,buildAnalysisTrend} from "../public/analysis-chart.js";
const s=(date,weight,reps,o={})=>({performed_on:date,weight_kg:weight,reps,is_completed:1,entry_unit:"kg_reps",...o});
test("maximum-weight pairs with reps from same completed set",()=>{
  assert.deepEqual(buildAnalysisTrend([s("2026-10-03",40,12),s("2026-10-03",45,8),
    s("2026-10-03",45,9),s("2026-10-03",50,15,{is_completed:0}),s("2026-10-02",35,10)],"all"),[
    {date:"2026-10-02",weight:35,reps:10},{date:"2026-10-03",weight:45,reps:9}]);
});
test("e1rm picks best estimate among every set, not just heaviest or most reps",()=>{
  const rows=[s("2026-10-10",40,12),s("2026-10-10",45,8),s("2026-10-10",42.5,10),
    s("2026-10-10",60,12,{is_completed:0})];
  assert.equal(buildAnalysisMetrics(rows,"e1rm","all")[0].value,57);
  assert.equal(buildAnalysisMetrics(rows,"weight","all")[0].value,45);
  assert.equal(buildAnalysisMetrics(rows,"volume","all")[0].value,1265);
  assert.equal(buildAnalysisMetrics(rows,"volume","all")[0].sets.length,3);
});
test("high repetition estimates are omitted but their volume is counted",()=>{
  const rows=[s("2026-10-11",50,1),s("2026-10-11",20,35)];
  assert.equal(buildAnalysisMetrics(rows,"e1rm","all")[0].value,50);
  assert.equal(buildAnalysisMetrics(rows,"volume","all")[0].value,750);
  assert.equal(buildAnalysisMetrics([s("2026-10-12",20,35)],"e1rm","all").length,0);
});
test("legacy completed counted and other units, unchecked or invalid excluded",()=>{
  assert.deepEqual(buildAnalysisTrend([s("2026-10-13",10,8,{is_completed:"0"}),
    s("2026-10-13",0,10,{entry_unit:"reps"}),
    {performed_on:"2026-10-11",weight_kg:12.5,reps:14},s("2026-10-11",0,20)],"all"),
    [{date:"2026-10-11",weight:12.5,reps:14}]);
});
test("month boundary and date sort",()=>{
  assert.deepEqual(buildAnalysisDays([s("2026-03-31",35,9),s("2026-02-27",30,10),
    s("2026-02-28",30,11)],"1m","2026-03-31").map(d=>d.date),
    ["2026-02-28","2026-03-31"]);
});
test("graph details preserve record editor and SD stage",()=>{
  const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  assert.match(js,/openAnalysisRecord\(selectedAnalysisExercise, analysisChartDate.value\)/);
  assert.match(js,/analysisChartDate\.addEventListener\("change"/);
  assert.match(html,/id="analysis-chart-day-sets"/);
  assert.match(html,/analysis-sd-space sd-page-companion/);
});
