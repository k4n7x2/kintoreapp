import {calendarWeekday} from "./calendar-plan.js";

export function missingTrainingSetup(error) {
  return /no such table:\s*(?:main\.)?(?:gym_weekly_slots|workout_menu_templates)/i
    .test(String(error?.message??error));
}

export function normalizeTemplate(body) {
  const title=typeof body?.title==="string"?body.title.trim():"";
  if (!title || title.length>60 || !Array.isArray(body?.items) ||
      body.items.length<1 || body.items.length>20) return null;
  const names=new Set(),items=[];
  for(const entry of body.items){
    const name=typeof entry?.name==="string"?entry.name.trim():"";
    const key=name.normalize("NFKC").replace(/\s+/g,"").toLocaleLowerCase();
    const unit=entry?.unit??"kg_reps",sets=entry?.sets,note=entry?.note??"";
    if(!name || name.length>60 || names.has(key) ||
      !["kg_reps","reps","seconds"].includes(unit) ||
      !Number.isInteger(sets)||sets<1||sets>12||
      typeof note!=="string"||note.length>300) return null;
    names.add(key);items.push({name,unit,sets,note});
  }
  return {title,items};
}

export function weekSlotOn(date,slots) {
  return slots.filter(slot=>slot.weekday===calendarWeekday(date) && slot.starts_on<=date)
    .sort((a,b)=>b.starts_on.localeCompare(a.starts_on))[0]??null;
}
const mapTemplate=row=>({
  id:row.id,title:row.title,items:JSON.parse(row.items_json)
});
async function listTemplates(db) {
  const rows=await db.prepare(
    "SELECT id,title,items_json FROM workout_menu_templates ORDER BY id DESC"
  ).all();
  return (rows.results??[]).map(mapTemplate);
}
async function listSlots(db) {
  const rows=await db.prepare(
    "SELECT weekday,starts_on,kind,template_id FROM gym_weekly_slots ORDER BY weekday,starts_on"
  ).all();
  return rows.results??[];
}
export async function readWeekSlots(db) {
  try {return {ready:true,slots:await listSlots(db)};}
  catch(error) {if(missingTrainingSetup(error))return {ready:false,slots:[]};throw error;}
}

export async function handleTrainingSetupAPI(db,url,request,method,{respond,validDate,readJSON}) {
  const path=url.pathname;
  try {
    if(path==="/api/training-setup" && method==="GET") {
      const [templates,slots]=await Promise.all([listTemplates(db),listSlots(db)]);
      return respond({ready:true,templates,slots});
    }
    if(path==="/api/training-setup/day" && method==="GET"){
      const date=url.searchParams.get("date");
      if(!validDate(date))return respond({error:"invalid_date"},400);
      const slots=await listSlots(db),slot=weekSlotOn(date,slots);
      let template=null;
      if(slot?.kind==="gym"&&slot.template_id!==null){
        const row=await db.prepare(
          "SELECT id,title,items_json FROM workout_menu_templates WHERE id=?"
        ).bind(slot.template_id).first();
        if(row)template=mapTemplate(row);
      }
      return respond({ready:true,slot,template});
    }
    if(path==="/api/training-setup/templates" && method==="POST") {
      const parsed=await readJSON(request,8000);
      if(parsed.error)return respond({error:parsed.error},parsed.status);
      const item=normalizeTemplate(parsed.value);
      if(!item)return respond({error:"invalid_template"},400);
      const saved=await db.prepare(
        "INSERT INTO workout_menu_templates (title,items_json) VALUES (?,?)"
      ).bind(item.title,JSON.stringify(item.items)).run();
      return respond({saved:true,id:saved.meta?.last_row_id??null},201);
    }
    const hit=/^\/api\/training-setup\/templates\/(\d+)$/.exec(path);
    if(hit&&method==="DELETE"){
      const id=Number(hit[1]);
      if(!Number.isSafeInteger(id)||id<1)return respond({error:"invalid_id"},400);
      await db.batch([
        db.prepare("UPDATE gym_weekly_slots SET template_id=NULL WHERE template_id=?").bind(id),
        db.prepare("DELETE FROM workout_menu_templates WHERE id=?").bind(id)
      ]);
      return respond({deleted:true});
    }
    if(path==="/api/training-setup/week" && method==="PUT"){
      const parsed=await readJSON(request,5000);
      if(parsed.error)return respond({error:parsed.error},parsed.status);
      const {starts_on,slots}=parsed.value??{};
      if(!validDate(starts_on)||!Array.isArray(slots)||slots.length!==7)
        return respond({error:"invalid_week_schedule"},400);
      const days=new Set(),filtered=[];
      for(const item of slots){
        const {weekday,kind,template_id=null}=item??{};
        if(!Number.isInteger(weekday)||weekday<1||weekday>7||days.has(weekday)||
           !["none","gym","rest"].includes(kind)||
           (template_id!==null&&(!Number.isSafeInteger(template_id)||template_id<1))||
           (kind!=="gym" && template_id!==null))
          return respond({error:"invalid_week_schedule"},400);
        days.add(weekday);
        filtered.push({weekday,kind,template_id});
      }
      if(filtered.some(x=>x.template_id!==null)){
        const templates=await listTemplates(db);
        const ids=new Set(templates.map(x=>x.id));
        if(filtered.some(x=>x.template_id!==null&&!ids.has(x.template_id)))
          return respond({error:"template_not_found"},409);
      }
      const statements=[];
      for(const row of filtered)statements.push(db.prepare(
        "INSERT INTO gym_weekly_slots (weekday,starts_on,kind,template_id) VALUES (?,?,?,?) "+
        "ON CONFLICT(weekday,starts_on) DO UPDATE SET kind=excluded.kind, "+
        "template_id=excluded.template_id, updated_at=CURRENT_TIMESTAMP"
      ).bind(row.weekday,starts_on,row.kind,row.template_id));
      await db.batch(statements);
      return respond({saved:true,slots:filtered});
    }
    return respond({error:"method_not_allowed"},405);
  }catch(error){
    if(missingTrainingSetup(error))return respond({error:"training_setup_migration_required",ready:false},503);
    throw error;
  }
}
