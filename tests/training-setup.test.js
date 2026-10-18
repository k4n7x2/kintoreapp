import test from "node:test";
import assert from "node:assert/strict";
import {handleTrainingSetupAPI,normalizeTemplate,weekSlotOn} from "../src/training-setup.js";

class FakeD1 {
  constructor({ready=true}={}){this.ready=ready;this.menus=[];this.slots=[];this.nextId=1;this.writes=[];}
  prepare(sql){
    const db=this;
    return {bind(...args){return {
      all:async()=>({results:db.read(sql,args)}),
      first:async()=>db.read(sql,args)[0]??null,
      run:async()=>db.write(sql,args)
    }}};
  }
  async batch(statements){for(const x of statements)await x.run();}
  read(sql,args){
    if(!this.ready)throw Error("no such table: workout_menu_templates");
    if(sql.startsWith("SELECT id,title,items_json FROM workout_menu_templates WHERE id="))
      return this.menus.filter(x=>x.id===args[0]);
    if(sql.startsWith("SELECT id,title,items_json FROM workout_menu_templates"))
      return [...this.menus].sort((a,b)=>b.id-a.id);
    if(sql.startsWith("SELECT weekday,starts_on,kind,template_id FROM gym_weekly_slots"))
      return this.slots;
    throw Error("unexpected SELECT: "+sql);
  }
  write(sql,args){
    this.writes.push(sql);
    if(sql.startsWith("INSERT INTO workout_menu_templates")){
      const id=this.nextId++;
      this.menus.push({id,title:args[0],items_json:args[1]});
      return {meta:{last_row_id:id}};
    }
    if(sql.startsWith("INSERT INTO gym_weekly_slots")){
      this.slots=this.slots.filter(x=>x.weekday!==args[0]||x.starts_on!==args[1]);
      this.slots.push({weekday:args[0],starts_on:args[1],kind:args[2],template_id:args[3]});
      return {success:true};
    }
    if(sql.startsWith("UPDATE gym_weekly_slots SET template_id=NULL")){
      for(const x of this.slots)if(x.template_id===args[0])x.template_id=null;
      return {success:true};
    }
    if(sql.startsWith("DELETE FROM workout_menu_templates")){
      this.menus=this.menus.filter(x=>x.id!==args[0]);
      return {success:true};
    }
    throw Error("unexpected SQL: "+sql);
  }
}
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const deps={respond:(body,status=200)=>({body,status}),validDate,
 readJSON:async req=>({value:JSON.parse(await req.text())})};
const urlFor=path=>new URL("https://example.test"+path);
const api=(db,path,method="GET",body={})=>handleTrainingSetupAPI(db,urlFor(path),
  {text:async()=>JSON.stringify(body)},method,deps);
const seven=(gymId=null)=>[1,2,3,4,5,6,7].map(weekday=>({
  weekday,kind:weekday===2?"gym":weekday===4?"rest":"none",
  template_id:weekday===2?gymId:null
}));
const menu={title:"胸・腕の日",items:[{name:"チェストプレス",unit:"kg_reps",sets:2,note:""}]};

test("save a reusable one-day template with exercise counts, not completed weights",async()=>{
  const db=new FakeD1();
  const res=await api(db,"/api/training-setup/templates","POST",menu);
  assert.equal(res.status,201);
  const listed=await api(db,"/api/training-setup");
  assert.equal(listed.body.templates[0].title,"胸・腕の日");
  assert.deepEqual(listed.body.templates[0].items,menu.items);
  assert.equal(db.writes.some(x=>/workout_sessions|workout_sets/.test(x)),false);
});
test("weekly schedule links the template automatically without making seven daily clones",async()=>{
  const db=new FakeD1();
  const created=await api(db,"/api/training-setup/templates","POST",menu);
  const updated=await api(db,"/api/training-setup/week","PUT",{
    starts_on:"2026-10-19",slots:seven(created.body.id)
  });
  assert.equal(updated.status,200);
  const tue=await api(db,"/api/training-setup/day?date=2026-10-27");
  assert.equal(tue.body.slot.kind,"gym");
  assert.equal(tue.body.template.title,"胸・腕の日");
  const thu=await api(db,"/api/training-setup/day?date=2026-10-22");
  assert.equal(thu.body.slot.kind,"rest");
  assert.equal(thu.body.template,null);
  assert.equal(db.slots.length,7);
});
test("editing weekly setup preserves earlier dates through versioned weekday slots",async()=>{
  const db=new FakeD1();
  await api(db,"/api/training-setup/week","PUT",{starts_on:"2026-10-19",slots:seven()});
  await api(db,"/api/training-setup/week","PUT",{starts_on:"2026-10-26",
    slots:[1,2,3,4,5,6,7].map(weekday=>({weekday,kind:weekday===2?"rest":"none",template_id:null}))});
  assert.equal(weekSlotOn("2026-10-20",db.slots).kind,"gym");
  assert.equal(weekSlotOn("2026-10-27",db.slots).kind,"rest");
});
test("menu deletion unlinks all existing weekly rules but preserves their gym days",async()=>{
  const db=new FakeD1();
  const created=await api(db,"/api/training-setup/templates","POST",menu);
  await api(db,"/api/training-setup/week","PUT",{
    starts_on:"2026-10-19",slots:seven(created.body.id)
  });
  assert.equal((await api(db,"/api/training-setup/templates/"+created.body.id,"DELETE")).status,200);
  assert.equal(weekSlotOn("2026-10-27",db.slots).kind,"gym");
  assert.equal(weekSlotOn("2026-10-27",db.slots).template_id,null);
});
test("rejects malformed duplicates, nonexistent template, and unauthenticated schema cases",async()=>{
  const db=new FakeD1();
  assert.equal(normalizeTemplate({title:"",items:menu.items}),null);
  assert.equal(normalizeTemplate({title:"重複",items:[...menu.items,...menu.items]}),null);
  assert.equal((await api(db,"/api/training-setup/week","PUT",{
    starts_on:"2026-10-19",slots:seven(999)})).status,409);
  assert.equal((await api(db,"/api/training-setup/week","PUT",{
    starts_on:"2026-10-19",slots:seven().slice(0,6)})).status,400);
  const missing=new FakeD1({ready:false});
  assert.equal((await api(missing,"/api/training-setup")).status,503);
  assert.equal(db.writes.length,0);
});
