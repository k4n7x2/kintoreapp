// Saved menu templates are recipes, not workout records. Edits only update the recipe.
export function validateTemplateDraft(value) {
  const title=typeof value?.title==="string"?value.title.trim():"";
  const rows=value?.items;
  if (!title||title.length>60) return {error:"テンプレート名は1〜60文字で入力してください。"};
  if (!Array.isArray(rows)||rows.length<1||rows.length>20)
    return {error:"種目は1〜20件で登録してください。"};
  const names=new Set(),items=[];
  for (const row of rows) {
    const name=typeof row?.name==="string"?row.name.trim():"";
    const key=name.normalize("NFKC").replace(/\s+/g,"").toLocaleLowerCase();
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

export function createSavedTemplateEditor({host,request,onUpdated,onUnauthorized}) {
  const titleInput=host.querySelector("#weekly-template-edit-title");
  const itemsHost=host.querySelector("#weekly-template-edit-items");
  const addButton=host.querySelector("#weekly-template-edit-add");
  const saveButton=host.querySelector("#weekly-template-edit-save");
  const cancelButton=host.querySelector("#weekly-template-edit-cancel");
  const feedback=host.querySelector("#weekly-template-edit-feedback");
  let currentId=null,busy=false,original="";
  const element=(tag,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    return node;
  };
  const labeled=(title,field)=>{
    const label=element("label");
    const name=element("span");
    name.textContent=title;
    label.append(name,field);
    return label;
  };
  function draft(){
    return {title:titleInput.value,items:[...itemsHost.children].map(row=>({
      name:row.querySelector(".weekly-template-edit-name").value,
      unit:row.querySelector(".weekly-template-edit-unit").value,
      sets:row.querySelector(".weekly-template-edit-sets").value,
      note:row.querySelector(".weekly-template-edit-note").value
    }))};
  }
  function reindex(){
    const rows=[...itemsHost.children];
    for(const [index,row] of rows.entries()){
      row.querySelector(".weekly-template-edit-number").textContent="種目 "+(index+1);
      row.querySelector(".weekly-template-move-up").disabled=busy||index===0;
      row.querySelector(".weekly-template-move-down").disabled=busy||index===rows.length-1;
      row.querySelector(".weekly-template-remove-item").disabled=busy||rows.length===1;
    }
    addButton.disabled=busy||rows.length>=20;
  }
  function appendItem(data={name:"",unit:"kg_reps",sets:2,note:""}){
    const row=element("div","weekly-template-edit-item");
    const heading=element("div","weekly-template-edit-item-heading");
    const headingText=element("strong","weekly-template-edit-number");
    const actions=element("div","weekly-template-edit-item-controls");
    const action=(text,cls,description,handler)=>{
      const button=element("button",cls);
      button.type="button";button.textContent=text;button.setAttribute("aria-label",description);
      button.addEventListener("click",handler);actions.append(button);
      return button;
    };
    action("↑","weekly-template-move-up","種目を上へ",()=>{
      if(busy)return;
      const previous=row.previousElementSibling;
      if(previous)itemsHost.insertBefore(row,previous);
      reindex();
    });
    action("↓","weekly-template-move-down","種目を下へ",()=>{
      if(busy)return;
      const next=row.nextElementSibling;
      if(next)itemsHost.insertBefore(next,row);
      reindex();
    });
    action("×","weekly-template-remove-item","この種目を削除",()=>{
      if(busy||itemsHost.children.length<=1)return;
      row.remove();reindex();
    });
    heading.append(headingText,actions);
    const name=element("input","weekly-template-edit-name");
    name.type="text";name.maxLength=60;name.value=data.name??"";
    name.autocomplete="off";name.required=true;
    name.setAttribute("aria-label","種目名");
    const unit=element("select","weekly-template-edit-unit");
    for(const [key,label] of [["kg_reps","重量・回数"],["reps","回数"],["seconds","秒数"]]){
      const option=element("option");option.value=key;option.textContent=label;unit.append(option);
    }
    unit.value=data.unit??"kg_reps";
    const sets=element("input","weekly-template-edit-sets");
    sets.type="number";sets.min="1";sets.max="12";sets.step="1";
    sets.inputMode="numeric";sets.value=String(data.sets??2);
    const metrics=element("div","weekly-template-edit-metrics");
    metrics.append(labeled("単位",unit),labeled("セット数",sets));
    const note=element("textarea","weekly-template-edit-note");
    note.rows=2;note.maxLength=300;note.value=data.note??"";
    note.placeholder="任意";
    row.append(heading,labeled("種目名",name),metrics,labeled("メモ",note));
    itemsHost.append(row);
    reindex();
  }
  function close(){
    if(busy)return;
    currentId=null;original="";host.hidden=true;
    titleInput.value="";itemsHost.replaceChildren();feedback.textContent="";
  }
  function open(template){
    if(busy)return;
    if(currentId!==null && currentId!==template.id &&
      JSON.stringify(draft())!==original &&
      !window.confirm("編集途中の変更を破棄して別のテンプレートを開きますか？"))return;
    currentId=template.id;
    titleInput.value=template.title;
    itemsHost.replaceChildren();
    for(const item of template.items||[])appendItem(item);
    feedback.textContent="";
    host.hidden=false;
    original=JSON.stringify(draft());
    titleInput.focus();
    host.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
  function setBusy(value){
    busy=value;
    for(const control of host.querySelectorAll("input,select,textarea,button"))
      control.disabled=value;
    if(!value)reindex();
  }
  addButton.addEventListener("click",()=>{
    if(busy||itemsHost.children.length>=20)return;
    appendItem();
    itemsHost.lastElementChild.querySelector("input").focus();
  });
  cancelButton.addEventListener("click",close);
  saveButton.addEventListener("click",async()=>{
    if(busy||currentId===null)return;
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
      close();
      onUpdated({id,...result.value});
    }catch(error){
      setBusy(false);
      if(error.status===401){onUnauthorized();return;}
      feedback.textContent=error.status===404?
        "テンプレートが見つかりません。再読み込みして確認してください。":
        error.status===503?"D1の設定を確認してください。":
        "変更を保存できませんでした。接続と入力内容を確認してください。";
    }
  });
  return {open,close,isOpen:()=>currentId!==null};
}
