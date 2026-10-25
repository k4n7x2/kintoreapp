// Exercise analytics are computed only from completed kg/reps sets.
const CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
let chart, loader, generation=0;
export const ANALYSIS_METRICS = Object.freeze({
  e1rm:{label:"推定1RM",unit:"kg"},
  weight:{label:"最大重量",unit:"kg"},
  volume:{label:"総ボリューム",unit:"kg"}
});
function since(period, today) {
  if(period==="all")return "";
  const m={"1m":1,"3m":3,"1y":12}[period];
  if(!m||!/^\d{4}-\d{2}-\d{2}$/.test(today))return "";
  const [y,mo,day]=today.split("-").map(Number);
  const start=new Date(Date.UTC(y,mo-1-m,1));
  const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  return [start.getUTCFullYear(),String(start.getUTCMonth()+1).padStart(2,"0"),
    String(Math.min(day,last)).padStart(2,"0")].join("-");
}
export function buildAnalysisDays(sets,period="3m",today="") {
  const start=since(period,today), groups=new Map();
  for(const row of Array.isArray(sets)?sets:[]) {
    if(!row||(row.is_completed!=null&&Number(row.is_completed)!==1))continue;
    if((row.entry_unit||"kg_reps")!=="kg_reps")continue;
    const date=row.performed_on,weight=Number(row.weight_kg),reps=Number(row.reps);
    if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      (start&&date<start)||!Number.isFinite(weight)||weight<=0||
      !Number.isInteger(reps)||reps<1)continue;
    if(!groups.has(date))groups.set(date,[]);
    groups.get(date).push({date,weight,reps,set_number:Number(row.set_number)||0});
  }
  return [...groups].map(([date,sets])=>{
    sets.sort((a,b)=>a.set_number-b.set_number);
    const strongest=sets.reduce((a,b)=>!a||b.weight>a.weight||
      (b.weight===a.weight&&b.reps>a.reps)?b:a,null);
    // Epley is a rough estimate, not a measured maximum. Ignore >30 reps for e1rm.
    const estimated=sets.filter(s=>s.reps<=30).map(s=>s.reps===1?
      s.weight:s.weight*(1+s.reps/30));
    const e1rm=estimated.length?Number(Math.max(...estimated).toFixed(2)):null;
    const volume=Number(sets.reduce((sum,s)=>sum+s.weight*s.reps,0).toFixed(2));
    return {date,weight:strongest.weight,reps:strongest.reps,e1rm,volume,sets};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
// Kept for compatibility with existing max-weight-and-reps tests.
export function buildAnalysisTrend(sets,period="3m",today="") {
  return buildAnalysisDays(sets,period,today).map(({date,weight,reps})=>({date,weight,reps}));
}
export function buildAnalysisMetrics(sets,metric="e1rm",period="3m",today="") {
  const field=Object.hasOwn(ANALYSIS_METRICS,metric)?metric:"e1rm";
  return buildAnalysisDays(sets,period,today).filter(d=>field!=="e1rm"||d.e1rm!==null)
    .map(d=>({...d,value:field==="e1rm"?d.e1rm:field==="weight"?d.weight:d.volume}));
}
function chartCtor(){
  if(typeof window.Chart==="function")return Promise.resolve(window.Chart);
  if(loader)return loader;
  loader=new Promise((resolve,reject)=>{
    const tag=document.createElement("script");
    tag.src=CDN;tag.async=true;tag.crossOrigin="anonymous";
    tag.onload=()=>typeof window.Chart==="function"?resolve(window.Chart):reject(Error("chart_missing"));
    tag.onerror=()=>reject(Error("chart_load_failed"));
    document.head.appendChild(tag);
  }).catch(error=>{loader=null;document.querySelector('script[src="'+CDN+'"]')?.remove();throw error;});
  return loader;
}
const muted=()=>getComputedStyle(document.documentElement).getPropertyValue("--muted").trim()||"#999";
export function destroyAnalysisTrend(){++generation;chart?.destroy();chart=null;}
export function refreshAnalysisTrendTheme(){
  if(!chart)return;
  chart.options.scales.x.ticks.color=muted();
  chart.options.scales.y.ticks.color=muted();
  chart.update("none");
}
export async function renderAnalysisTrend({points,metric="e1rm",truncated,canvas,status,onSelectDate}){
  destroyAnalysisTrend();
  const current=generation;
  canvas.hidden=!points?.length;
  if(!points?.length){status.textContent="この期間に対象の実施記録がありません（重量がない種目は対象外）。";return;}
  status.textContent="グラフを読み込み中…";
  const def=ANALYSIS_METRICS[metric]||ANALYSIS_METRICS.e1rm;
  try{
    const Chart=await chartCtor();
    if(current!==generation||!canvas.isConnected||canvas.closest("[hidden]"))return;
    canvas.hidden=false;
    chart=new Chart(canvas,{
      type:"line",
      data:{labels:points.map(d=>d.date.slice(5).replace("-","/")),datasets:[{
        label:def.label,data:points.map(d=>d.value),borderColor:"#60a5fa",
        backgroundColor:"#60a5fa",pointBackgroundColor:"#60a5fa",
        borderWidth:2.5,pointRadius:4,pointHoverRadius:6,pointHitRadius:18,tension:.15
      }]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,
        interaction:{mode:"index",intersect:false},
        onClick:(_,hits)=>{const d=points[hits[0]?.index];if(d)onSelectDate?.(d.date);},
        onHover:(_,hits)=>{canvas.style.cursor=hits.length?"pointer":"default";},
        plugins:{legend:{display:false},tooltip:{mode:"index",intersect:false,callbacks:{
          title:items=>points[items[0]?.dataIndex]?.date||"",
          label:item=>def.label+"："+item.parsed.y+def.unit
        }}},
        scales:{
          x:{ticks:{color:muted(),maxTicksLimit:6,maxRotation:0},grid:{display:false},border:{display:false}},
          y:{type:"linear",position:"left",beginAtZero:false,title:{display:true,text:def.unit,color:"#60a5fa"},
            ticks:{color:muted()},grid:{color:"rgba(139,124,158,.17)"}}
        }
      }
    });
    status.textContent=truncated?"取得上限1,200セットのため、古い記録の一部が含まれていません。":"";
  }catch{
    if(current!==generation)return;
    canvas.hidden=true;
    status.textContent="グラフを読み込めませんでした。下の実施日一覧は利用できます。";
  }
}
