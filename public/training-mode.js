// Android-first, one-set-at-a-time training flow. No personal data in browser storage.
const byId = id => document.getElementById(id);
const nameKey = value => String(value || "").normalize("NFKC").replace(/[\s\u3000]+/g, "").toLowerCase();
const html = value => String(value).replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),
    String(now.getDate()).padStart(2,"0")].join("-");
};
async function api(path, payload) {
  const options = payload === undefined ? {} : {method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)};
  const response = await fetch(path,{...options,credentials:"same-origin",cache:"no-store"});
  let data;
  try { data=await response.json(); } catch { data={}; }
  if(!response.ok) {
    const error = new Error(data.error || "api_error"); error.status=response.status; throw error;
  }
  return data;
}

export function createTrainingMode(root, {onUnauthorized, openRecord}) {
  const state = {date:"",items:[],screen:"list",selected:-1,setNumber:1,
    weight:"",reps:"",busy:false,error:"",restUntil:0,run:0,active:false};
  let timer=null;
  function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
  function leave(){state.active=false;state.run++;stopTimer();}
  function reset(){leave();state.items=[];state.screen="list";root.replaceChildren();}
  function selected(){return state.items[state.selected];}
  function listView() {
    const total=state.items.length;
    const complete=state.items.filter(item=>item.finished && item.sets.length).length;
    const rows=state.items.map((item,index)=>{
      const count=item.sets.length, finished=item.finished && count>0;
      const status=finished?"完了":count?"途中":"未実施";
      return `<button type="button" class="tm-item ${finished?"tm-item--done":""}"
        data-action="choose" data-index="${index}" aria-label="${html(item.name)}、${status}、${count}セット記録">
        <span class="tm-item-main"><strong>${html(item.name)}</strong>
        <small>${count} / ${Math.max(count,item.targetSets)} セット</small></span>
        <span class="tm-item-status">${finished?"✓ ":""}${status}</span>
      </button>`;
    }).join("");
    const isRest=state.dayRest;
    root.innerHTML=`<div class="tm-title"><h1>本日のメニュー</h1>
      <span>${html(state.date.replaceAll("-","/"))}</span></div>
      <div class="tm-progress-copy"><span>トレーニング進捗</span>
      <strong>${complete} / ${total} 種目</strong></div>
      <div class="tm-progress"><span style="width:${total?complete/total*100:0}%"></span></div>
      ${total?`<div class="tm-list">${rows}</div>`:
        `<p class="tm-empty">${isRest?"今日は休息日の予定です。":"本日のメニューは未登録です。"}</p>`}
      ${total && complete===total?`<p class="tm-complete">本日のメニューはすべて完了しました。</p>`:""}
      <p class="tm-help">種目を選ぶと、前回の重量・回数を確認できます。</p>
      <button type="button" class="tm-link" data-action="record">記録画面で種目・予定を編集</button>
      <p class="tm-error" role="alert">${html(state.error)}</p>`;
  }
  function lastSet(item,number) {
    const exact=item.previous.find(row=>Number(row.set_number)===number && (row.entry_unit||"kg_reps")===item.unit);
    return exact || null;
  }
  function setView() {
    const item=selected();
    if(!item){state.screen="list";return listView();}
    const previous=lastSet(item,state.setNumber);
    const priorText=previous ? item.unit==="seconds" ? `${previous.duration_seconds} 秒`
      : item.unit==="reps" ? `${previous.reps} 回`
      : `${Number(previous.weight_kg)} kg × ${previous.reps} 回` : "前回の同セットの記録なし";
    const isTime=item.unit==="seconds",amountName=isTime?"秒数（秒）":"回数（回）";
    root.innerHTML=`<button type="button" class="tm-back" data-action="list">‹ 一覧に戻る</button>
      <div class="tm-title"><h1>${html(item.name)}</h1><span>${state.setNumber} / ${item.targetSets} セット（予定）</span></div>
      <div class="tm-previous"><small>前回・${state.setNumber}セット目</small><strong>${html(priorText)}</strong></div>
      ${item.unit==="kg_reps"?`<div class="tm-field"><label for="tm-weight">今回の重量（kg）</label>
       <div class="tm-stepper"><button type="button" data-action="step" data-field="weight" data-direction="-1" aria-label="重量を2.5kg減らす">−</button>
       <input id="tm-weight" type="number" min="0" max="2000" inputmode="decimal" step="any" value="${html(state.weight)}">
       <button type="button" data-action="step" data-field="weight" data-direction="1" aria-label="重量を2.5kg増やす">＋</button></div>
       <small>±2.5 kg・直接入力も可能</small></div>`:""}
      <div class="tm-field"><label for="tm-reps">今回の${amountName}</label>
        <div class="tm-stepper"><button type="button" data-action="step" data-field="reps" data-direction="-1" aria-label="${amountName}を減らす">−</button>
        <input id="tm-reps" type="number" min="0" inputmode="numeric" step="1" placeholder="入力" value="${html(state.reps)}">
        <button type="button" data-action="step" data-field="reps" data-direction="1" aria-label="${amountName}を増やす">＋</button></div>
        <small>${isTime?"±5 秒":"±1 回"}・直接入力も可能</small></div>
      <button type="button" class="tm-primary" data-action="save" id="tm-save">1セット終了 →</button>
      <p class="tm-error" role="alert">${html(state.error)}</p>`;
    updateSaveButton();
  }
  function restView() {
    const item=selected();
    root.innerHTML=`<button type="button" class="tm-back" data-action="list">‹ 一覧に戻る</button>
      <div class="tm-rest"><div class="tm-clock-icon" aria-hidden="true">◷</div>
      <h1>インターバル</h1><p>${html(item.name)} ・ ${state.setNumber}セット目完了</p>
      <strong id="tm-clock" role="timer">01:30</strong><small id="tm-clock-caption">休憩時間</small></div>
      <button type="button" class="tm-primary" data-action="next"${state.setNumber>=12?" disabled":""}>次のセットへ →</button>
      <button type="button" class="tm-secondary" data-action="finish">この種目を終了する</button>
      <p class="tm-error" role="alert">${html(state.error)}</p>`;
    stopTimer();
    updateTimer();
    timer=setInterval(updateTimer,1000);
  }
  function updateTimer() {
    const clock=byId("tm-clock");
    if(!clock||!state.active||state.screen!=="rest"){stopTimer();return;}
    const seconds=Math.max(0,Math.ceil((state.restUntil-Date.now())/1000));
    clock.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
    const caption=byId("tm-clock-caption");
    if(caption)caption.textContent=seconds?"休憩時間の目安（90秒）":"休憩時間が経過しました";
    if(seconds===0)stopTimer();
  }
  function render() {
    if(!state.active)return;
    if(state.screen==="set")setView();
    else if(state.screen==="rest")restView();
    else listView();
  }
  function updateSaveButton() {
    const button=byId("tm-save");
    if(!button)return;
    const item=selected();
    const amount=Number(state.reps),weight=Number(state.weight);
    const validAmount=state.reps!=="" && Number.isInteger(amount) &&
      amount>=1 && amount<=(item.unit==="seconds"?36000:1000);
    const validWeight=item.unit!=="kg_reps" ||
      (state.weight!=="" && Number.isFinite(weight) && weight>=0 && weight<=2000);
    button.disabled=state.busy || !validAmount || !validWeight;
    button.textContent=state.busy?"保存中…":"1セット終了 →";
  }
  function enterSet() {
    const item=selected();
    state.screen="set";state.error="";state.busy=false;
    const previous=lastSet(item,state.setNumber);
    const own=item.sets.find(row=>Number(row.set_number)===state.setNumber);
    state.weight=String(own?.weight_kg ?? previous?.weight_kg ?? 0);
    state.reps=own?String(item.unit==="seconds"?own.duration_seconds:own.reps):"";
    render();
  }
  async function choose(index) {
    if(!state.items[index]||state.busy)return;
    stopTimer();
    state.selected=index;
    const item=selected();
    state.setNumber=Math.max(0,...item.sets.map(s=>Number(s.set_number)||0))+1;
    if(state.setNumber>12){state.error="この種目は上限の12セットに達しています。記録画面で編集してください。";state.screen="list";render();return;}
    state.error="";state.busy=true;
    root.innerHTML='<p class="tm-loading" role="status">前回の記録を確認中…</p>';
    const token=state.run;
    if(!item.previousLoaded){
      try{
        const data=await api("/api/workouts/recent?name="+encodeURIComponent(item.name)+"&before="+state.date);
        if(!state.active||state.run!==token||selected()!==item)return;
        item.previous=Array.isArray(data.sets)?data.sets:[];item.previousLoaded=true;
      }catch(error){if(error.status===401){onUnauthorized();return;}item.previous=[];}
    }
    if(state.active && state.run===token && selected()===item){state.busy=false;enterSet();}
  }
  async function save() {
    if(state.busy || state.screen!=="set")return;
    updateSaveButton();
    const item=selected();
    const num=state.setNumber, amount=Number(state.reps), weight=Number(state.weight);
    if(state.reps===""||!Number.isInteger(amount)||amount<1||
       amount>(item.unit==="seconds"?36000:1000)||
       (item.unit==="kg_reps"&&(state.weight===""||!Number.isFinite(weight)||weight<0||weight>2000)))return;
    state.busy=true;state.error="";updateSaveButton();
    const payload={performed_on:state.date,exercise_name:item.name,unit:item.unit,
      set_number:num,weight_kg:item.unit==="kg_reps"?weight:0,
      reps:item.unit==="seconds"?0:amount,
      duration_seconds:item.unit==="seconds"?amount:0};
    try{
      await api("/api/training-mode/set",payload);
      if(!state.active)return;
      item.sets=item.sets.filter(row=>Number(row.set_number)!==num);
      item.sets.push({...payload,entry_unit:item.unit});
      item.finished=false;
      state.screen="rest";state.restUntil=Date.now()+90000;state.error="";render();
    }catch(error) {
      if(error.status===401){onUnauthorized();return;}
      state.error=error.status===409?"旧形式の記録と重複します。記録画面から編集してください。":
        "保存できませんでした。接続を確認してもう一度押してください。";
      state.busy=false;render();
    }finally{state.busy=false;}
  }
  async function finish() {
    if(state.busy||state.screen!=="rest")return;
    state.busy=true;state.error="";stopTimer();render();
    const item=selected();
    try{
      await api("/api/training-mode/finish",{performed_on:state.date,exercise_name:item.name});
      if(!state.active)return;
      item.finished=true;state.screen="list";state.error="";render();
    }catch(error){
      if(error.status===401){onUnauthorized();return;}
      state.error="種目の終了状態を保存できませんでした。再度操作してください。";
      state.screen="rest";render();
    }finally{state.busy=false;}
  }
  async function open() {
    stopTimer();
    state.active=true;state.date=today();state.screen="list";state.items=[];
    state.error="";state.busy=false;state.dayRest=false;
    const token=++state.run;
    root.innerHTML='<p class="tm-loading" role="status">本日のメニューを読み込み中…</p>';
    try {
      const [day,calendar,weekly,repeat] = await Promise.all([
        api("/api/training-mode/day?date="+state.date),
        api("/api/calendar?month="+state.date.slice(0,7)),
        api("/api/training-setup/day?date="+state.date),
        api("/api/repeat?date="+state.date)
      ]);
      if(!state.active||token!==state.run)return;
      if(day.truncated)throw Error("truncated");
      const entry=(calendar.days||[]).find(x=>x.on_date===state.date);
      state.dayRest=!!entry?.rest;
      const items=new Map();
      const add=(name,unit,targetSets)=>{
        const key=nameKey(name);if(!key)return;
        if(!items.has(key))items.set(key,{name:key,unit:unit||"kg_reps",
          targetSets:Math.min(12,Math.max(1,targetSets||3)),
          sets:[],finished:false,previous:[],previousLoaded:false});
      };
      if(entry?.planned&&entry?.source==="weekly-template"&&weekly.template?.items) {
        for(const item of weekly.template.items)add(item.name,item.unit,item.sets);
      }else if(entry?.planned&&entry?.source==="repeat") {
        const occurrence=(repeat.occurrences||[]).find(x=>x.kind==="gym");
        for(const item of occurrence?.exercises||[])add(item.name,item.unit,item.sets?.length);
      }
      // Saved sets are always visible, even if the weekly plan was later changed.
      const seen=new Map();
      for(const row of day.sets||[]){
        const key=nameKey(row.exercise_name);if(!key)continue;
        add(key,row.entry_unit||"kg_reps",3);
        const item=items.get(key);
        if(!seen.has(key))seen.set(key,new Set());
        if(!seen.get(key).has(Number(row.set_number))) {
          item.sets.push(row);seen.get(key).add(Number(row.set_number));
        }
      }
      for(const row of day.progress||[]){
        const item=items.get(nameKey(row.exercise_name));
        if(item)item.finished=!!row.finished && item.sets.length>0;
      }
      state.items=[...items.values()];
      render();
    }catch(error) {
      if(!state.active||token!==state.run)return;
      if(error.status===401){onUnauthorized();return;}
      root.innerHTML='<h1 class="tm-error">メニューを取得できませんでした</h1><p>接続状態またはD1の更新状況を確認してください。</p>'+
        '<button class="tm-secondary" type="button" data-action="reload">再読み込み</button>'+
        '<button class="tm-link" type="button" data-action="record">既存の記録画面へ</button>';
    }
  }
  root.addEventListener("input",event=>{
    if(event.target.id==="tm-weight")state.weight=event.target.value;
    else if(event.target.id==="tm-reps")state.reps=event.target.value;
    else return;
    updateSaveButton();
  });
  root.addEventListener("click",event=>{
    const button=event.target.closest("button[data-action]");
    if(!button||state.busy||!state.active)return;
    const action=button.dataset.action;
    if(action==="choose")void choose(Number(button.dataset.index));
    else if(action==="list"){stopTimer();state.screen="list";state.error="";render();}
    else if(action==="step"){
      const field=button.dataset.field,delta=Number(button.dataset.direction);
      if(field==="weight")state.weight=String(Math.max(0,Math.round(((Number(state.weight)||0)+delta*2.5)*100)/100));
      if(field==="reps")state.reps=String(Math.max(0,(Number(state.reps)||0)+delta*(selected()?.unit==="seconds"?5:1)));
      render();
    }else if(action==="save")void save();
    else if(action==="next"){
      if(state.setNumber>=12)return;
      stopTimer();state.setNumber++;enterSet();
    }else if(action==="finish")void finish();
    else if(action==="record")openRecord();
    else if(action==="reload")void open();
  });
  return {open,leave,reset};
}
