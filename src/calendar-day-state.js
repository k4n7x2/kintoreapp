// One effective plan state per date. Data sources are retained independently:
// an explicit day-level selection always replaces a recurring occurrence.
// "attended" and performed workout records are never part of plan resolution.
export function resolveDayPlan({manual=null,legacyOverride=null,legacyRecurring=false,repeat=null,weekly=null}={}) {
  if (manual?.rest) return {planned:false,rest:true,source:"manual"};
  if (legacyOverride === 0) return {planned:false,rest:false,source:"exception"};
  if (legacyOverride === 1) return {planned:true,rest:false,
    source:weekly?.kind==="gym"?"weekly-template":"exception"};
  if (manual?.planned) return {planned:true,rest:false,
    source:weekly?.kind==="gym"?"weekly-template":"manual"};
  if (weekly?.kind === "rest") return {planned:false,rest:true,source:"weekly-template"};
  if (weekly?.kind === "gym") return {planned:true,rest:false,source:"weekly-template"};
  if (weekly?.kind === "none") return {planned:false,rest:false,source:"weekly-template"};
  if (repeat?.kind === "rest") return {planned:false,rest:true,source:"repeat"};
  if (repeat?.kind === "gym") return {planned:true,rest:false,source:"repeat"};
  if (legacyRecurring) return {planned:true,rest:false,source:"legacy"};
  return {planned:false,rest:false,source:"none"};
}
export function dayPlanKind(plan) {
  return plan.rest ? "rest" : plan.planned ? "gym" : "none";
}
