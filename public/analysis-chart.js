// Pure per-day summarization and lazy-loaded mixed Chart.js visualization.
const URL = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
let loading = null, chart = null, version = 0;
function cutoff(period, today) {
  if (period === "all") return "";
  const months = {"1m":1,"3m":3,"1y":12}[period];
  if (!months || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return "";
  const [year, month, day] = today.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - months - 1, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(Math.min(day,last)).padStart(2,"0")].join("-");
}
export function buildAnalysisTrend(sets, period="3m", today="") {
  const first=cutoff(period,today), days=new Map();
  for (const s of Array.isArray(sets)?sets:[]) {
    if (s.is_completed != null && Number(s.is_completed)!==1) continue;
    if ((s.entry_unit||"kg_reps")!=="kg_reps") continue;
    const date=s.performed_on, weight=Number(s.weight_kg), reps=Number(s.reps);
    if (typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (first&&date<first) || !Number.isFinite(weight) || weight<0 ||
      !Number.isInteger(reps) || reps<0) continue;
    const old=days.get(date);
    if (!old||weight>old.weight||(weight===old.weight&&reps>old.reps)) days.set(date,{date,weight,reps});
  }
  return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function chartClass() {
  if (typeof window.Chart==="function") return Promise.resolve(window.Chart);
  if (loading) return loading;
  loading=new Promise((resolve,reject)=>{
    const tag=document.createElement("script");
    tag.src=URL;tag.async=true;tag.crossOrigin="anonymous";
    tag.onload=()=>typeof window.Chart==="function"?resolve(window.Chart):reject(Error("chart_missing"));
    tag.onerror=()=>reject(Error("chart_unavailable"));
    document.head.appendChild(tag);
  }).catch(e=>{loading=null;document.querySelector('script[src="'+URL+'"]')?.remove();throw e;});
  return loading;
}
const muted=()=>getComputedStyle(document.documentElement).getPropertyValue("--muted").trim()||"#999";
export function destroyAnalysisTrend(){++version;chart?.destroy();chart=null;}
export function refreshAnalysisTrendTheme(){
  if(!chart)return;
  for(const scale of Object.values(chart.options.scales))scale.ticks.color=muted();
  chart.update("none");
}
export async function renderAnalysisTrend({sets,period,todayKey,truncated,canvas,status}){
  destroyAnalysisTrend();
  const current=version,points=buildAnalysisTrend(sets,period,todayKey);
  canvas.hidden=!points.length;
  if(!points.length){status.textContent="この期間に実施済みの重量・回数記録はありません。";return;}
  status.textContent="グラフを読み込み中…";
  try{
    const Chart=await chartClass();
    if(current!==version||!canvas.isConnected||canvas.closest("[hidden]"))return;
    canvas.hidden=false;
    chart=new Chart(canvas,{
      data:{labels:points.map(p=>p.date.slice(5).replace("-","/")),datasets:[
        {type:"bar",label:"回数",data:points.map(p=>p.reps),yAxisID:"reps",order:2,
          backgroundColor:"rgba(244,114,182,.65)",borderColor:"#f472b6",
          borderWidth:1,borderRadius:4,maxBarThickness:23},
        {type:"line",label:"重量",data:points.map(p=>p.weight),yAxisID:"weight",order:1,
          borderColor:"#60a5fa",backgroundColor:"#60a5fa",
          pointBackgroundColor:"#60a5fa",borderWidth:2.6,pointRadius:3,
          pointHoverRadius:5,tension:.15}
      ]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,
        interaction:{mode:"index",intersect:false},
        plugins:{legend:{display:false},tooltip:{mode:"index",intersect:false,callbacks:{
          title:items=>points[items[0]?.dataIndex]?.date||"",
          label:item=>item.dataset.label+"："+item.parsed.y+(item.dataset.yAxisID==="weight"?"kg":"回")
        }}},
        scales:{
          x:{ticks:{color:muted(),maxTicksLimit:6,maxRotation:0},grid:{display:false},border:{display:false}},
          weight:{type:"linear",position:"left",title:{display:true,text:"kg",color:"#60a5fa"},
            ticks:{color:muted()},grid:{color:"rgba(139,124,158,.17)"}},
          reps:{type:"linear",position:"right",beginAtZero:true,title:{display:true,text:"回",color:"#f472b6"},
            ticks:{color:muted(),precision:0},grid:{drawOnChartArea:false}}
        }
      }
    });
    status.textContent=truncated?"履歴の上限1,200セットにより古い記録の一部が含まれません。":"";
  }catch(e){
    if(current!==version)return;
    canvas.hidden=true;status.textContent="グラフを読み込めませんでした。下の実施日一覧は利用できます。";
  }
}
