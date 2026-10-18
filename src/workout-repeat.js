import { matchesSeries, validateRepeatContent } from "./workout-repeat-rule.js";
import { previousISODate } from "./calendar-plan.js";

export function missingWorkoutRepeat(error) {
  return /no such table:\s*(?:main\.)?workout_repeat_(?:series|exceptions)/i.test(String(error?.message ?? error));
}

async function matchingRows(db, date) {
  const [series, exceptions] = await Promise.all([
    db.prepare("SELECT * FROM workout_repeat_series WHERE starts_on <= ? AND (ends_on IS NULL OR ends_on >= ?) ORDER BY id")
      .bind(date,date).all(),
    db.prepare("SELECT * FROM workout_repeat_exceptions WHERE on_date = ?").bind(date).all()
  ]);
  const overrides=new Map((exceptions.results||[]).map(row=>[row.series_id,row]));
  return (series.results||[]).filter(row=>matchesSeries(date,row) && !overrides.get(row.id)?.cancelled)
    .map(row=>({...row,content_json:overrides.get(row.id)?.content_json || row.content_json}));
}

export async function repeatOnDate(db,date) {
  const rows=await matchingRows(db,date);
  const groups=[...new Set(rows.map(row=>row.group_id))];
  const latest=new Map(await Promise.all(groups.map(async group=>{
    const tail=await db.prepare("SELECT ends_on FROM workout_repeat_series WHERE group_id=? ORDER BY starts_on DESC LIMIT 1")
      .bind(group).first();
    return [group,tail?.ends_on??null];
  })));
  return rows.map(row=>({id:row.id,group_id:row.group_id,cadence:row.cadence,
    every_n:row.every_n,starts_on:row.starts_on,ends_on:latest.get(row.group_id)??null,
    ...validateRepeatContent(JSON.parse(row.content_json))}));
}
export async function repeatMonth(db, range) {
  let rows, exceptions;
  try {
    [rows,exceptions]=await Promise.all([
      db.prepare("SELECT * FROM workout_repeat_series WHERE starts_on < ? AND (ends_on IS NULL OR ends_on >= ?) ORDER BY id")
        .bind(range[1],range[0]).all(),
      db.prepare("SELECT * FROM workout_repeat_exceptions WHERE on_date >= ? AND on_date < ?")
        .bind(...range).all()
    ]);
  } catch(error) {
    if (missingWorkoutRepeat(error)) return {ready:false,dates:[],days:[]};
    throw error;
  }
  const rules=(rows.results||[]).sort((a,b)=>a.id-b.id), overrides=new Map((exceptions.results||[])
    .map(row=>[row.series_id+"|"+row.on_date,row])), days=[];
  const [year,month]=range[0].split("-").map(Number);
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  for (let d=1;d<=count;d++) {
    const date=range[0].slice(0,8)+String(d).padStart(2,"0");
    const active = rules.filter(row=>matchesSeries(date,row) &&
      !overrides.get(row.id+"|"+date)?.cancelled);
    if (!active.length) continue;
    // A date should never silently merge incompatible gym/rest occurrences.
    // If duplicated series exist, surface the last one rather than assigning both states.
    const row=active[active.length-1];
    const exception=overrides.get(row.id+"|"+date);
    const content=validateRepeatContent(JSON.parse(exception?.content_json || row.content_json));
    if (content) days.push({on_date:date,kind:content.kind,conflict:active.length>1});
  }
  return {ready:true,days,dates:days.map(day=>day.on_date)};
}
export async function handleRepeatAPI(db,url,request,method,{respond,validDate,monthRange,readJSON}) {
  if (method==="GET" && url.pathname==="/api/repeat") {
    const date=url.searchParams.get("date");
    if (!validDate(date)) return respond({error:"invalid_date"},400);
    try { return respond({occurrences:await repeatOnDate(db,date),ready:true}); }
    catch(error) { if(missingWorkoutRepeat(error)) return respond({occurrences:[],ready:false});throw error; }
  }
  if (method==="POST" && url.pathname==="/api/repeat") {
    const parsed=await readJSON(request,24000);
    if(parsed.error)return respond({error:parsed.error},parsed.status);
    const {start_on,end_on=null,cadence="weekly",every_n=1,kind,exercises}=parsed.value||{};
    if(!validDate(start_on)||(end_on!==null&&(!validDate(end_on)||end_on<start_on))||
      !["daily","weekly","monthly"].includes(cadence)||!Number.isInteger(every_n)||every_n<1||every_n>12)
      return respond({error:"invalid_recurrence"},400);
    const snapshot=validateRepeatContent(kind === undefined ? exercises : {kind,exercises});
    if(!snapshot)return respond({error:"invalid_snapshot"},400);
    try {
      let currentDay=null, restReady=true;
      try {
        currentDay=await db.prepare("SELECT planned, rest FROM gym_calendar_days WHERE on_date=?")
          .bind(start_on).first();
      } catch(error) {
        if (/no such column:\s*rest\b/i.test(String(error?.message??error))) {
          restReady=false;
          currentDay=await db.prepare("SELECT planned FROM gym_calendar_days WHERE on_date=?")
            .bind(start_on).first();
        } else if (!/no such table:\s*(?:main\.)?gym_calendar_days/i.test(String(error?.message??error))) {
          throw error;
        }
      }
      if(snapshot.kind==="rest" && !restReady) return respond({error:"rest_migration_required"},503);
      if(currentDay?.rest && snapshot.kind !== "rest")return respond({error:"rest_day_conflict"},409);
      if((await repeatOnDate(db,start_on)).length)return respond({error:"already_repeating"},409);
      // Prevent new overlapping full-series rules (not just a collision on the start date).
      // Existing conflicting data is never removed automatically.
      const otherRows=await db.prepare(
        "SELECT starts_on, ends_on, cadence, every_n FROM workout_repeat_series WHERE (ends_on IS NULL OR ends_on >= ?) AND starts_on <= ?"
      ).bind(start_on,end_on??"2100-12-31").all();
      const horizon=end_on??"2100-12-31";
      const startDay=Date.parse(start_on+"T00:00:00Z");
      const endDay=Date.parse(horizon+"T00:00:00Z");
      const candidates=otherRows.results??[];
      for (let timestamp=startDay;candidates.length && timestamp<=endDay;timestamp+=86400000) {
        const day=new Date(timestamp).toISOString().slice(0,10);
        if (!matchesSeries(day,{starts_on:start_on,ends_on:end_on,cadence,every_n})) continue;
        if (candidates.some(old=>matchesSeries(day,old))) {
          return respond({error:"overlapping_recurrence"},409);
        }
      }
      // Adopt the matching one-off status into the series, otherwise cancelling its
      // first occurrence would expose the original standalone day flag again.
      // Attendance, historical sets, and unrelated status rows are never changed.
      const adopt = snapshot.kind==="rest" ? !!currentDay?.rest : !!currentDay?.planned;
      const statements=[
        db.prepare("INSERT INTO workout_repeat_series (group_id,starts_on,ends_on,cadence,every_n,content_json) VALUES (?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),start_on,end_on,cadence,every_n,JSON.stringify(snapshot))
      ];
      if(adopt) statements.push(db.prepare(restReady
        ? "UPDATE gym_calendar_days SET planned=0, rest=0, updated_at=CURRENT_TIMESTAMP WHERE on_date=?"
        : "UPDATE gym_calendar_days SET planned=0, updated_at=CURRENT_TIMESTAMP WHERE on_date=?")
        .bind(start_on));
      // The user is explicitly turning this date into a repeating entry.
      // A legacy per-day override would otherwise mask the first occurrence forever.
      statements.push(db.prepare("DELETE FROM gym_plan_overrides WHERE on_date=?").bind(start_on));
      const results=await db.batch(statements);
      return respond({saved:true,id:results[0]?.meta?.last_row_id??null},201);
    } catch(error){if(missingWorkoutRepeat(error))return respond({error:"repeat_migration_required"},503);throw error;}
  }
  const hit=/^\/api\/repeat\/(\d+)$/.exec(url.pathname);
  if(!hit||!["PATCH","DELETE"].includes(method))return respond({error:"method_not_allowed"},405);
  const id=Number(hit[1]);
  if(!Number.isSafeInteger(id)||id<=0)return respond({error:"invalid_id"},400);
  const parsed=await readJSON(request,24000);
  if(parsed.error)return respond({error:parsed.error},parsed.status);
  const {date,scope,kind,exercises,cadence:requestedCadence,every_n:requestedEvery,
    end_on:requestedEnd}=parsed.value||{};
  if(!validDate(date)||!["only","future","all"].includes(scope))
    return respond({error:"invalid_scope"},400);
  const snapshot=method==="PATCH"?
    validateRepeatContent(kind === undefined ? exercises : {kind,exercises}):null;
  if(method==="PATCH"&&!snapshot)return respond({error:"invalid_snapshot"},400);
  if(method==="PATCH"&&scope!=="only"&&(
      !["daily","weekly","monthly"].includes(requestedCadence)||
      !Number.isInteger(requestedEvery)||requestedEvery<1||requestedEvery>12||
      !(requestedEnd===null||validDate(requestedEnd))))
    return respond({error:"invalid_recurrence"},400);
  try {
    const source=await db.prepare("SELECT * FROM workout_repeat_series WHERE id = ?").bind(id).first();
    if(!source)return respond({error:"not_found"},404);
    const occurrences=await repeatOnDate(db,date);
    if(!occurrences.some(x=>x.id===id))return respond({error:"not_an_occurrence"},409);
    const payload=snapshot?JSON.stringify(snapshot):null;
    if(scope==="only"){
      await db.prepare("INSERT INTO workout_repeat_exceptions (series_id,on_date,cancelled,content_json) VALUES (?,?,?,?) "+
        "ON CONFLICT(series_id,on_date) DO UPDATE SET cancelled=excluded.cancelled,content_json=excluded.content_json")
        .bind(id,date,method==="DELETE"?1:0,payload).run();
      return respond({saved:true,scope});
    }
    if(scope==="all"){
      if(method==="PATCH"){
        const parts=await db.prepare("SELECT id, starts_on FROM workout_repeat_series WHERE group_id=? ORDER BY starts_on DESC")
          .bind(source.group_id).all();
        const latest=parts.results?.[0];
        if(requestedEnd!==null&&latest&&requestedEnd<latest.starts_on)
          return respond({error:"end_before_latest_segment"},409);
        await db.batch([
          db.prepare("UPDATE workout_repeat_series SET content_json=?,cadence=?,every_n=? WHERE group_id=?")
            .bind(payload,requestedCadence,requestedEvery,source.group_id),
          db.prepare("UPDATE workout_repeat_series SET ends_on=? WHERE id=?")
            .bind(requestedEnd,latest?.id??id)
        ]);
      }else{
        await db.batch([
          db.prepare("DELETE FROM workout_repeat_exceptions WHERE series_id IN (SELECT id FROM workout_repeat_series WHERE group_id=?)").bind(source.group_id),
          db.prepare("DELETE FROM workout_repeat_series WHERE group_id=?").bind(source.group_id)
        ]);
      }
      return respond({saved:true,scope});
    }
    // 'future': retain every previous occurrence; supersede future segments, including their exceptions.
    if(method==="PATCH"&&requestedEnd!==null&&requestedEnd<date)
      return respond({error:"invalid_end_on"},400);
    const cleanup=db.prepare("DELETE FROM workout_repeat_exceptions WHERE series_id IN "+
      "(SELECT id FROM workout_repeat_series WHERE group_id=? AND starts_on>?)").bind(source.group_id,date);
    const deleteFuture=db.prepare("DELETE FROM workout_repeat_series WHERE group_id=? AND starts_on>?").bind(source.group_id,date);
    const statements=[cleanup,deleteFuture,
      db.prepare("DELETE FROM workout_repeat_exceptions WHERE series_id=? AND on_date>=?").bind(id,date)];
    if(source.starts_on===date){
      if(method==="DELETE"){
        statements.push(db.prepare("DELETE FROM workout_repeat_exceptions WHERE series_id=?").bind(id));
        statements.push(db.prepare("DELETE FROM workout_repeat_series WHERE id=?").bind(id));
      }else{
        statements.push(db.prepare("UPDATE workout_repeat_series SET content_json=?,cadence=?,every_n=?,ends_on=? WHERE id=?")
          .bind(payload,requestedCadence,requestedEvery,requestedEnd,id));
      }
    }else {
      statements.push(db.prepare("UPDATE workout_repeat_series SET ends_on=? WHERE id=?")
        .bind(previousISODate(date),id));
      if(method==="PATCH")statements.push(db.prepare(
        "INSERT INTO workout_repeat_series (group_id,starts_on,ends_on,cadence,every_n,content_json) VALUES (?,?,?,?,?,?)")
        .bind(source.group_id,date,requestedEnd,requestedCadence,requestedEvery,payload));
    }
    await db.batch(statements);
    return respond({saved:true,scope});
  }catch(error){
    if(missingWorkoutRepeat(error))return respond({error:"repeat_migration_required"},503);
    throw error;
  }
}
