// QA only: serves qa/fixtures with CORS on :8799 so the stubbed fetch can read them.
// 1) Static: GET /<name>.json -> qa/fixtures/<name>.json (unchanged).
// 2) Activity API routes (path with or without the /api prefix), built from the real payloads:
//    sport/record/statistics/list?statisticsType=1|2[&startTime=YYYY-MM-DD&endTime=YYYY-MM-DD]
//      (type missing/invalid -> code 500 envelope; type 1 filters dailyList by date, type 2 filters
//       monthList by yyyymm; totals are recomputed from the filtered rows; no rows -> stats-empty)
//    app/statistics -> totals.json | sport/record/badge/list -> badges.json
//    sport/record/detail?recordId=22401 -> record-detail-22401.json (other id -> code 500)
//    sport/record/list -> records-list.json
const http=require("http"),fs=require("fs"),path=require("path");
const FX=path.join(__dirname,"fixtures"),rd=(n)=>JSON.parse(fs.readFileSync(path.join(FX,n),"utf8"));
const fail=(msg)=>({code:500,msg,traceId:"fixture",data:null,error:true,success:false,warn:false});
const sum=(l,a,b,c)=>({totalDuration:l.reduce((s,r)=>s+r[a],0),totalConsume:l.reduce((s,r)=>s+r[b],0),totalCapacity:l.reduce((s,r)=>s+r[c],0),totalDistance:0.0});
function stats(q){
  const t=q.get("statisticsType"); if(t===null||t==="") return fail("统计类型不能为空");
  if(t!=="1"&&t!=="2") return fail("type conversion error (only 1 daily, 2 monthly)");
  const a=q.get("startTime"),b=q.get("endTime"),all=rd("stats-daily-all.json"),env=Object.assign({},all);
  if(t==="1"){
    const l=(all.data.dailyList||[]).filter(r=>(!a||r.sportDate>=a)&&(!b||r.sportDate<=b));
    if(!l.length) return rd("stats-empty.json");
    env.data={...sum(l,"realDuration","realConsume","realCapacity"),dailyList:l,monthList:null}; return env;
  }
  const m=rd("stats-monthly.json"),ym=(s)=>s.slice(0,4)+s.slice(5,7);
  const l=(m.data.monthList||[]).filter(r=>(!a||r.yearMonth>=ym(a))&&(!b||r.yearMonth<=ym(b)));
  if(!l.length) return rd("stats-empty.json");
  m.data={...sum(l,"totalDuration","totalConsume","totalCapacity"),dailyList:null,monthList:l}; return m;
}
function route(p,q){
  p=p.replace(/^\/api/,"");
  if(p==="/sport/record/statistics/list") return stats(q);
  if(p==="/app/statistics") return rd("totals.json");
  if(p==="/sport/record/badge/list") return rd("badges.json");
  if(p==="/sport/record/list") return rd("records-list.json");
  if(p==="/sport/record/detail") return q.get("recordId")==="22401"?rd("record-detail-22401.json"):fail("record not found");
  return null;
}
http.createServer((q,r)=>{r.setHeader("Access-Control-Allow-Origin","*");
 const u=new URL(q.url,"http://x"),j=route(u.pathname,u.searchParams);
 if(j){r.setHeader("Content-Type","application/json");return r.end(JSON.stringify(j))}
 const f=path.join(FX,path.basename(u.pathname));
 fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;return r.end("no")}r.setHeader("Content-Type","application/json");r.end(d)})}).listen(8799);
