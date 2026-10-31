(() => {
  try { localStorage.setItem("innodigym_token","dummy-qa-token"); localStorage.setItem("innodigym_email","qa@example.test"); } catch(e){}
  const F="http://localhost:8799/";
  const ok=(d)=>new Response(JSON.stringify({code:200,success:true,msg:"OK",data:d}),{status:200,headers:{"Content-Type":"application/json"}});
  const real=window.fetch.bind(window);
  window.__fetchLog=[];
  window.fetch=async (u,o)=>{
    const s=String(u); if(!s.startsWith("/api")) return real(u,o);
    window.__fetchLog.push(s);
    const p=s.split("?")[0];
    if(p==="/api/action/list"){const j=await (await real(F+"action-list-real.json")).json();return ok(Array.isArray(j)?j:j.data);}
    if(p==="/api/course/list"){const j=await (await real(F+"course-list-real.json")).json();return ok(Array.isArray(j)?j:j.data);}
    if(p==="/api/course/detail"){const j=await (await real(F+"course-detail-41.json")).json();return new Response(JSON.stringify(j),{status:200,headers:{"Content-Type":"application/json"}});}
    if(p==="/api/app/getInfo")return ok({email:"qa@example.test",nickname:"QA",height:175,weight:70,birthday:"1990-05-01",sex:1});
    return ok([]);
  };
})();
