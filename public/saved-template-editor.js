// Menu templates are recipes in D1, never completed workout records.
const keyOf=value=>typeof value==="string"?
  value.normalize("NFKC").replace(/\s+/g,"").toLocaleLowerCase():"";

export function validateTemplateDraft(value) {
  const title=typeof value?.title==="string"?value.title.trim():"";
  const rows=value?.items;
  if (!title||title.length>60) return {error:"テンプレート名は1〜60文字で入力してください。"};
  if (!Array.isArray(rows)||rows.length<1||rows.length>20)
    return {error:"種目は1〜20件で登録してください。"};
  const names=new Set(),items=[];
  for (const row of rows) {
    const name=typeof row?.name==="string"?row.name.trim():"";
    const key=keyOf(name);
    const unit=row?.unit,sets=Number(row?.sets),note=row?.note??"";
    if (!name||name.length>60)return {error:"種目名は1〜60文字で入力してください。"};
    if (names.has(key))return {error:"同じ種目が重複しています。"};
    if (!["kg_reps","reps","seconds"].includes(unit)||!Number.isInteger(sets)||sets<1||sets>12)
      return {error:"単位とセット数（1〜12）を確認してください。"};
    if (typeof note!=="string"||note.length>300)
      return {error:"メモは300文字以内にしてください。"};
    names.add(key);items.push({name,unit,sets,note});
  }
  return {value:{title,items}};
}

// Unified /api/exercises candidates: catalog items plus names found in past workouts.
// The API is authenticated and no personal data is cached outside the open dialog.
export function templateExerciseCandidates(data) {
  const mapped=new Map();
  for(const row of Array.isArray(data?.catalog)?data.catalog:[]){
    const name=typeof row?.name==="string"?row.name.trim():"",key=keyOf(name);
    if(!key)continue;
    mapped.set(key,{
      name,body_part:typeof row.body_part==="string"?row.body_part:"その他",
      unit:["kg_reps","reps","seconds"].includes(row.unit)?row.unit:"kg_reps",
      recorded:false
    });
  }
  for(const nameValue of Array.isArray(data?.recorded)?data.recorded:[]){
    const name=typeof nameValue==="string"?nameValue.trim():"",key=keyOf(name);
    if(!key)continue;
    if(mapped.has(key))mapped.get(key).recorded=true;
    else mapped.set(key,{name,body_part:"その他",unit:"kg_reps",recorded:true});
  }
  for(const nameValue of Array.isArray(data?.exercises)?data.exercises:[]){
    const name=typeof nameValue==="string"?nameValue.trim():"",key=keyOf(name);
    if(key&&!mapped.has(key))
      mapped.set(key,{name,body_part:"その他",unit:"kg_reps",recorded:false});
  }
  return [...mapped.values()].sort((a,b)=>
    Number(b.recorded)-Number(a.recorded)||a.name.localeCompare(b.name,"ja"));
}

export function filterTemplateCandidates(candidates,part,search,used,exceptName="") {
  const query=keyOf(search),excluded=new Set((used||[]).map(keyOf));
  excluded.delete(keyOf(exceptName));
  return candidates.filter(item=>
    (part==="すべて"||item.body_part===part) &&
    (!query||keyOf(item.name).includes(query)) &&
    !excluded.has(keyOf(item.name)));
}

export function createSavedTemplateEditor({host,request,onUpdated,onUnauthorized}) {
  const $=selector=>host.querySelector("#"+selector);
  const titleInput=$("weekly-template-edit-title");
  const itemsHost=$("weekly-template-edit-items");
  const addButton=$("weekly-template-edit-add");
  const saveButton=$("weekly-template-edit-save");
  const cancelButton=$("weekly-template-edit-cancel");
  const closeButton=$("weekly-template-edit-close");
  const backButton=$("weekly-template-edit-back");
  const feedback=$("weekly-template-edit-feedback");
  const listView=$("weekly-template-edit-list-view");
  const pickerView=$("weekly-template-edit-picker-view");
  const detailView=$("weekly-template-edit-detail-view");
  const footer=host.querySelector(".weekly-template-window-foot");
  const heading=$("weekly-template-editor-heading");
  const pickerPart=$("weekly-template-picker-part");
  const pickerSearch=$("weekly-template-picker-search");
  const pickerItems=$("weekly-template-picker-list");
  const pickerManual=$("weekly-template-picker-manual");
  const pickerFeedback=$("weekly-template-picker-feedback");
  const detailName=$("weekly-template-detail-name");
  const detailUnit=$("weekly-template-detail-unit");
  const detailSets=$("weekly-template-detail-sets");
  const detailNote=$("weekly-template-detail-note");
  const doneButton=$("weekly-template-detail-done");
  let currentId=null,busy=false,items=[],view="list",activeIndex=-1;
  let original="",candidateRows=[],catalogLoading=false,requestId=0;
  const unitText={kg_reps:"重量・回数",reps:"回数",seconds:"秒数"};
  const element=(tag,cls="",text="")=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text)node.textContent=text;
    return node;
  };
  const draft=()=>({title:titleInput.value,items:items.map(item=>({...item}))});
  const sameDraft=()=>{
    const snapshot=draft();
    // The detail inputs are still in the DOM until "確定" is pressed.
    if(view==="detail"&&activeIndex>=0&&snapshot.items[activeIndex]){
      snapshot.items[activeIndex]={
        ...snapshot.items[activeIndex],
        unit:detailUnit.value,sets:detailSets.value,
        note:detailNote.value
      };
    }
    // Normalize the draft and initial sets to strings for consistent comparison.
    const serial=value=>JSON.stringify({
      title:value.title,
      items:value.items.map(item=>({...item,sets:String(item.sets)}))
    });
    return serial(snapshot)===serial(JSON.parse(original));
  };
  const visible=()=>currentId!==null&&host.open;
  function setView(next){
    view=next;
    listView.hidden=next!=="list";
    pickerView.hidden=next!=="picker";
    detailView.hidden=next!=="detail";
    footer.hidden=next!=="list";
    feedback.textContent="";
    heading.textContent=next==="list"?"テンプレート編集":
      next==="picker"?"種目を選択":"種目の詳細";
    backButton.textContent=next==="list"?"‹ 設定へ":"‹ 種目一覧へ";
    host.querySelector(".weekly-template-window-scroll").scrollTop=0;
    if(next==="list")renderList();
    else if(next==="picker")renderCandidates();
    else renderDetail();
  }
  function renderList(){
    itemsHost.replaceChildren();
    for(const [index,item] of items.entries()){
      const row=element("div","weekly-template-edit-item");
      const openButton=element("button","weekly-template-edit-item-main");
      openButton.type="button";
      openButton.append(
        element("span","weekly-template-edit-index",String(index+1)),
        element("span","weekly-template-edit-item-name",item.name),
        element("small","weekly-template-edit-item-summary",item.sets+"セット · "+(unitText[item.unit]||"重量・回数")),
        element("span","weekly-template-edit-chevron","›")
      );
      openButton.setAttribute("aria-label",item.name+"の詳細を編集");
      openButton.addEventListener("click",()=>{activeIndex=index;setView("detail");});
      const controls=element("div","weekly-template-edit-order");
      const action=(label,cls,disabled,fn)=>{
        const button=element("button",cls,label);
        button.type="button";button.disabled=busy||disabled;
        button.setAttribute("aria-label",item.name+label);
        button.addEventListener("click",fn);
        controls.append(button);
      };
      action("↑","weekly-template-move-up",index===0,()=>{
        [items[index-1],items[index]]=[items[index],items[index-1]];
        renderList();
      });
      action("↓","weekly-template-move-down",index===items.length-1,()=>{
        [items[index],items[index+1]]=[items[index+1],items[index]];
        renderList();
      });
      action("×","weekly-template-remove-item",false,()=>{
        items.splice(index,1);renderList();
      });
      row.append(openButton,controls);
      itemsHost.append(row);
    }
    if(!items.length)itemsHost.append(element("p","weekly-template-edit-empty","種目がありません。下のボタンから追加してください。"));
    addButton.disabled=busy||items.length>=20;
  }
  function ensurePartOptions(){
    const values=new Set(candidateRows.map(x=>x.body_part));
    const known=new Set([...pickerPart.options].map(x=>x.value));
    for(const value of values){
      if(!value||known.has(value))continue;
      const option=document.createElement("option");
      option.value=value;option.textContent=value;pickerPart.append(option);
    }
  }
  function renderCandidates(){
    pickerItems.replaceChildren();
    const available=filterTemplateCandidates(candidateRows,pickerPart.value,
      pickerSearch.value,items.map(x=>x.name),activeIndex<0?"":items[activeIndex]?.name);
    for(const item of available){
      const button=element("button","weekly-template-choice");
      button.type="button";
      button.append(element("strong","",item.name),
        element("small","",item.body_part+" · "+(item.recorded?"記録あり":"登録済み")));
      button.addEventListener("click",()=>selectExercise(item));
      pickerItems.append(button);
    }
    if(!available.length)pickerItems.append(element("p","weekly-template-picker-empty",
      catalogLoading?"種目を読み込み中…":"該当する登録済み種目がありません。"));
    const custom=pickerSearch.value.trim();
    const found=candidateRows.some(x=>keyOf(x.name)===keyOf(custom));
    pickerManual.hidden=!custom||found;
    pickerManual.textContent="「"+custom+"」を新しい種目として使用";
  }
  function startPicker(replace=-1){
    activeIndex=replace;
    pickerPart.value="すべて";
    pickerSearch.value="";
    pickerFeedback.textContent="";
    setView("picker");
  }
  function selectExercise(candidate){
    const name=candidate.name.trim();
    if(!name||name.length>60){pickerFeedback.textContent="種目名は60文字以内にしてください。";return;}
    if(items.some((item,i)=>i!==activeIndex&&keyOf(item.name)===keyOf(name))){
      pickerFeedback.textContent="この種目はすでにメニューにあります。";
      return;
    }
    if(activeIndex<0){
      if(items.length>=20){pickerFeedback.textContent="種目は20件まで登録できます。";return;}
      items.push({name,unit:candidate.unit||"kg_reps",sets:2,note:""});
      activeIndex=items.length-1;
    }else {
      const current=items[activeIndex];
      items[activeIndex]={...current,name,unit:candidate.unit||current.unit};
    }
    setView("detail");
  }
  function renderDetail(){
    const item=items[activeIndex];
    if(!item){setView("list");return;}
    detailName.textContent=item.name;
    detailUnit.value=item.unit;
    detailSets.value=String(item.sets);
    detailNote.value=item.note||"";
    syncStepper();
  }
  function syncStepper(){
    const v=Number(detailSets.value);
    $("weekly-template-detail-minus").disabled=busy||!Number.isFinite(v)||v<=1;
    $("weekly-template-detail-plus").disabled=busy||!Number.isFinite(v)||v>=12;
  }
  function commitDetail(){
    const sets=Number(detailSets.value);
    if(!Number.isInteger(sets)||sets<1||sets>12){
      feedback.textContent="セット数は1〜12で入力してください。";return false;
    }
    if(!["kg_reps","reps","seconds"].includes(detailUnit.value))return false;
    if(activeIndex<0||!items[activeIndex])return false;
    items[activeIndex]={...items[activeIndex],
      unit:detailUnit.value,sets,note:detailNote.value};
    return true;
  }
  function goBack(){
    if(busy)return;
    if(view==="detail"){
      if(commitDetail())setView("list");
    } else if(view==="picker"){
      if(activeIndex>=0&&items[activeIndex])setView("detail");
      else setView("list");
    } else close();
  }
  function close(force=false){
    if(!visible()||busy&&!force)return;
    if(!force&&!sameDraft()&&!window.confirm("未保存の変更を破棄して閉じますか？"))return;
    ++requestId;
    currentId=null;items=[];activeIndex=-1;original="";
    host.close();
    feedback.textContent="";
  }
  async function open(template){
    if(busy||!template||!Number.isSafeInteger(template.id))return;
    if(visible()){
      if(!sameDraft()&&!window.confirm("未保存の変更を破棄して別のテンプレートを開きますか？"))return;
      ++requestId;
    }
    currentId=template.id;
    items=(Array.isArray(template.items)?template.items:[]).map(item=>({...item}));
    titleInput.value=template.title;
    activeIndex=-1;
    original=JSON.stringify(draft());
    candidateRows=[];
    catalogLoading=true;
    pickerPart.value="すべて";pickerSearch.value="";
    if(!host.open)host.showModal();
    setView("list");
    // Keep the keyboard closed on entry; the menu should be visible first.
    backButton.focus();
    const run=++requestId;
    try{
      const data=await request("/api/exercises");
      if(run!==requestId||!visible())return;
      candidateRows=templateExerciseCandidates(data);
      ensurePartOptions();
    }catch(error){
      if(run!==requestId||!visible())return;
      if(error.status===401){close(true);onUnauthorized();return;}
      pickerFeedback.textContent="登録済み種目を取得できませんでした。手入力で追加できます。";
    }finally{
      if(run===requestId&&visible()){
        catalogLoading=false;
        if(view==="picker")renderCandidates();
      }
    }
  }
  function setBusy(value){
    busy=value;
    for(const control of host.querySelectorAll("input,select,textarea,button"))control.disabled=value;
    if(!busy){syncStepper();renderList();}
  }
  addButton.addEventListener("click",()=>{if(!busy&&items.length<20)startPicker();});
  $("weekly-template-detail-change").addEventListener("click",()=>{
    if(!busy&&commitDetail())startPicker(activeIndex);
  });
  doneButton.addEventListener("click",()=>{
    if(!busy&&commitDetail())setView("list");
  });
  $("weekly-template-detail-minus").addEventListener("click",()=>{
    detailSets.value=String(Math.max(1,(Number(detailSets.value)||1)-1));syncStepper();
  });
  $("weekly-template-detail-plus").addEventListener("click",()=>{
    detailSets.value=String(Math.min(12,(Number(detailSets.value)||1)+1));syncStepper();
  });
  detailSets.addEventListener("input",syncStepper);
  pickerPart.addEventListener("change",renderCandidates);
  pickerSearch.addEventListener("input",()=>{pickerFeedback.textContent="";renderCandidates();});
  pickerManual.addEventListener("click",()=>{
    const name=pickerSearch.value.trim();
    selectExercise({name,unit:"kg_reps"});
  });
  backButton.addEventListener("click",goBack);
  closeButton.addEventListener("click",()=>close());
  cancelButton.addEventListener("click",()=>close());
  host.addEventListener("cancel",event=>{event.preventDefault();goBack();});
  saveButton.addEventListener("click",async()=>{
    if(busy||!visible()||view!=="list")return;
    const result=validateTemplateDraft(draft());
    if(result.error){feedback.textContent=result.error;return;}
    const id=currentId;
    setBusy(true);feedback.textContent="保存中…";
    try{
      await request("/api/training-setup/templates/"+id,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(result.value)
      });
      setBusy(false);
      close(true);
      onUpdated({id,...result.value});
    }catch(error){
      setBusy(false);
      if(error.status===401){close(true);onUnauthorized();return;}
      feedback.textContent=error.status===404?
        "テンプレートが見つかりません。再読み込みして確認してください。":
        error.status===503?"D1の設定を確認してください。":
        "変更を保存できませんでした。接続と入力内容を確認してください。";
    }
  });
  return {open,close,isOpen:visible};
}
