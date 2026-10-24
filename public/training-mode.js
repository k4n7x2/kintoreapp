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

// Pure UI rules are kept separate from DOM updates for repeatable tests.
export function resolvePreviousSet(previous, setNumber, unit) {
  const matches=(Array.isArray(previous)?previous:[]).filter(row =>
    (row.entry_unit || "kg_reps") === unit &&
    Number.isInteger(Number(row.set_number)) && Number(row.set_number) >= 1);
  const exact=matches.find(row=>Number(row.set_number)===setNumber);
  const fallback=matches.reduce((best,row)=>!best ||
    Number(row.set_number)>Number(best.set_number)?row:best,null);
  return {set:exact||fallback||null, fallback:!exact && !!fallback};
}
// Resolve only the editor's initial values. Nothing is saved until the user confirms a set.
export function initialTrainingSetValues(item, setNumber) {
  const previous=resolvePreviousSet(item.previous,setNumber,item.unit).set;
  const own=item.sets.find(row=>Number(row.set_number)===setNumber);
  const weight=own?.weight_kg ?? previous?.weight_kg ?? 0;
  const amount=item.unit==="seconds"
    ? own?.duration_seconds ?? previous?.duration_seconds
    : own?.reps ?? previous?.reps;
  return {
    weight:String(weight),
    reps:Number.isInteger(amount) && amount>0 ? String(amount) : ""
  };
}
export function visibleTrainingSets(item, setNumber) {
  const count=Math.min(4,Math.max(1,item.targetSets||3,setNumber));
  const first=Math.max(1,setNumber-count+1);
  return Array.from({length:count},(_,index)=>first+index);
}

export function completedTrainingSets(item) {
  return (item.sets||[]).filter(row=>Number(row.is_completed)===1).length;
}
export function nextTrainingSetNumber(item) {
  const done=new Set((item.sets||[]).filter(row=>Number(row.is_completed)===1)
    .map(row=>Number(row.set_number)));
  for(let number=1;number<=12;number++)if(!done.has(number))return number;
  return 13;
}

export function createTrainingMode(root, {onUnauthorized, openRecord, onSaved, onFinished}) {
  const state = {date:"",items:[],screen:"list",selected:-1,setNumber:1,
    weight:"",reps:"",busy:false,error:"",restUntil:0,run:0,active:false};
  let timer=null;
  function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
  function leave(){state.active=false;state.run++;stopTimer();}
  function reset(){leave();state.items=[];state.screen="list";root.replaceChildren();}
  function selected(){return state.items[state.selected];}
  function listView() {
    const total=state.items.length;
    const complete=state.items.filter(item=>item.finished && item.modeSets>0).length;
    const rows=state.items.map((item,index)=>{
      const count=item.sets.length,modeCount=item.modeSets,finished=item.finished && modeCount>0;
      const status=finished?"完了":modeCount?"途中":count?"未開始・記録あり":"未実施";
      return `<button type="button" class="tm-item ${finished?"tm-item--done":""}"
        data-action="choose" data-index="${index}" aria-label="${html(item.name)}、${status}、筋トレモード${modeCount}セット">
        <span class="tm-item-main"><strong>${html(item.name)}</strong>
        <small>${modeCount} / ${Math.max(modeCount,item.targetSets)} セット${count&&!modeCount?" · 記録 "+count+"セット":""}</small></span>
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
  function setView() {
    const item=selected();
    if(!item){state.screen="list";return listView();}
    const modeNumber=state.setNumber;
    const previous=resolvePreviousSet(item.previous,modeNumber,item.unit);
    const prior=previous.set;
    const priorText=prior ? item.unit==="seconds" ? `${prior.duration_seconds} 秒`
      : item.unit==="reps" ? `${prior.reps} 回`
      : `${Number(prior.weight_kg)} kg × ${prior.reps} 回` : "前回の記録なし";
    const priorLabel=previous.fallback ? "前回の最終セット" : `前回・${modeNumber}セット目`;
    const isTime=item.unit==="seconds";
    const amountLabel=isTime?"秒数":"回数";
    const amountUnit=isTime?"秒":"回";
    const extra=modeNumber>item.targetSets;
    const countLabel=extra?`追加セット ${modeNumber}`:`${modeNumber} / ${item.targetSets} セット`;
    const chips=visibleTrainingSets(item,modeNumber).map(number=>{
      const saved=item.sets.some(row=>Number(row.set_number)===number && Number(row.is_completed)===1);
      const current=number===modeNumber;
      const className=saved?"is-done":current?"is-current":"";
      const status=saved?"記録済み":current?"入力中":"未実施";
      return `<span role="listitem" class="tm-set-marker ${className}" aria-label="${number}セット目・${status}">${saved?"✓":number}</span>`;
    }).join("");
    root.innerHTML=`<div class="tm-workout-topline">
      <button type="button" class="tm-back" data-action="list">‹ メニュー</button>
      <span class="tm-workout-label">WORKOUT / SET ${String(modeNumber).padStart(2,"0")}</span>
      </div>
      <div class="tm-exercise-head"><h1>${html(item.name)}</h1>
      <span class="tm-set-caption">${countLabel}</span></div>
      <div class="tm-set-progress" role="list" aria-label="本日のセット進捗" style="grid-template-columns:repeat(${visibleTrainingSets(item,modeNumber).length},minmax(0,1fr))">${chips}</div>
      <div class="tm-prev-row"><span>${priorLabel}</span>
      <strong class="${prior?"":"tm-prev-missing"}">${html(priorText)}</strong></div>
      ${item.unit==="kg_reps"?`<div class="tm-data-row">
        <label for="tm-weight">重量</label>
        <div class="tm-stepper">
          <button type="button" data-action="step" data-field="weight" data-direction="-1" aria-label="重量を2.5kg減らす">−</button>
          <div class="tm-stepper-value"><input id="tm-weight" type="number" min="0" max="2000" inputmode="decimal" step="any" value="${html(state.weight)}" aria-label="今回の重量">
          <span class="tm-stepper-unit" aria-hidden="true">kg</span></div>
          <button type="button" data-action="step" data-field="weight" data-direction="1" aria-label="重量を2.5kg増やす">＋</button>
        </div></div>`:""}
      <div class="tm-data-row">
        <label for="tm-reps">${amountLabel}</label>
        <div class="tm-stepper">
          <button type="button" data-action="step" data-field="reps" data-direction="-1" aria-label="${amountLabel}を${isTime?"5秒":"1回"}減らす">−</button>
          <div class="tm-stepper-value"><input id="tm-reps" type="number" min="0" inputmode="numeric" step="1" placeholder="—" value="${html(state.reps)}" aria-label="今回の${amountLabel}">
          <span class="tm-stepper-unit" aria-hidden="true">${amountUnit}</span></div>
          <button type="button" data-action="step" data-field="reps" data-direction="1" aria-label="${amountLabel}を${isTime?"5秒":"1回"}増やす">＋</button>
        </div></div>
      <button type="button" class="tm-primary tm-compact-save" data-action="save" id="tm-save">✓ セットを記録する</button>
      <p class="tm-error" role="alert">${html(state.error)}</p>`;
    updateSaveButton();
  }
  function restView() {
    const item=selected();
    root.innerHTML=`<button type="button" class="tm-back" data-action="list">‹ 一覧に戻る</button>
      <div class="tm-rest"><div class="tm-clock-icon" aria-hidden="true">◷</div>
      <h1>インターバル</h1><p>${html(item.name)} ・ ${state.setNumber}セット目完了</p>
      <strong id="tm-clock" role="timer">01:30</strong><small id="tm-clock-caption">休憩時間</small></div>
      <button type="button" class="tm-primary" data-action="next"${nextTrainingSetNumber(item)>12?" disabled":""}>次のセットへ →</button>
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
    button.textContent=state.busy?"保存中…":"✓ セットを記録する";
  }
  function enterSet() {
    const item=selected();
    state.screen="set";state.error="";state.busy=false;
    const defaults=initialTrainingSetValues(item,state.setNumber);
    state.weight=defaults.weight;
    state.reps=defaults.reps;
    render();
  }
  async function choose(index) {
    if(!state.items[index]||state.busy)return;
    stopTimer();
    state.selected=index;
    const item=selected();
    state.setNumber=nextTrainingSetNumber(item);
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
    const existing=item.sets.find(row=>Number(row.set_number)===num);
    if(existing) {
      const previous=existing.entry_unit==="seconds"
        ? Number(existing.duration_seconds)+"秒"
        : existing.entry_unit==="reps" ? Number(existing.reps)+"回"
        : Number(existing.weight_kg)+"kg × "+Number(existing.reps)+"回";
      if(!Number.isInteger(Number(existing.id)) || Number(existing.id)<1) {
        state.error="既存セットの確認ができません。メニューを開き直してください。";
        render();return;
      }
      if(!confirm(num+"セット目には「"+previous+"」の記録があります。\n今回の重量・回数に置き換えますか？"))return;
    }
    state.busy=true;state.error="";updateSaveButton();
    const payload={performed_on:state.date,exercise_name:item.name,unit:item.unit,
      set_number:num,expected_completed_sets:item.modeSets,
      ...(existing?{replace_set_id:Number(existing.id)}:{}),
      weight_kg:item.unit==="kg_reps"?weight:0,
      reps:item.unit==="seconds"?0:amount,
      duration_seconds:item.unit==="seconds"?amount:0};
    try{
      const saved=await api("/api/training-mode/set",payload);
      if(!state.active)return;
      item.sets=item.sets.filter(row=>Number(row.set_number)!==num);
      item.sets.push({...payload,id:existing?.id??saved.id,entry_unit:item.unit,is_completed:1});
      item.modeSets=completedTrainingSets(item);
      item.finished=false;
      if (typeof onSaved === "function") onSaved();
      state.screen="rest";state.restUntil=Date.now()+90000;state.error="";render();
    }catch(error) {
      if(error.status===401){onUnauthorized();return;}
      state.error=error.status===409?"記録が別画面で更新されたか、以前の保存形式と競合しています。メニューを開き直して確認してください。":
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
      item.finished=true;state.screen="list";state.error="";
      if(typeof onFinished==="function")onFinished();
      render();
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
          sets:[],modeSets:0,finished:false,previous:[],previousLoaded:false});
      };
      if(entry?.planned&&entry?.source==="weekly-template"&&weekly.template?.items) {
        for(const item of weekly.template.items)add(item.name,item.unit,item.sets);
      }else if(entry?.planned&&entry?.source==="repeat") {
        const occurrence=(repeat.occurrences||[]).filter(x=>x.kind==="gym").at(-1);
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
        if(item){
          item.finished=!!row.finished;
        }
      }
      state.items=[...items.values()];
      for(const item of state.items){
        item.modeSets=completedTrainingSets(item);
        item.finished=item.finished && item.modeSets>0;
      }
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
      const next=nextTrainingSetNumber(selected());
      if(next>12)return;
      stopTimer();state.setNumber=next;enterSet();
    }else if(action==="finish")void finish();
    else if(action==="record")openRecord();
    else if(action==="reload")void open();
  });
  return {open,leave,reset};
}
