// QA only: stub fetch for the Fitness screen. Variant from location.hash: #last (default) | #empty | #multi | #error
(() => {
  try { localStorage.setItem("innodigym_token","dummy-qa-token"); localStorage.setItem("innodigym_email","qa@example.test"); } catch(e){}
  const F="http://localhost:8799/", real=window.fetch.bind(window);
  window.fetch=async (u,o)=>{
    const s=String(u); if(!s.startsWith("/api")) return real(u,o);
    const p=s.split("?")[0], v=(location.hash||"#last").slice(1);
    if(p==="/api/physicalFitnessTest/last"){
      if(v==="error") return new Response(JSON.stringify({success:false,msg:"Boom <b>x</b>"}),{status:500,headers:{"Content-Type":"application/json"}});
      const f=v==="empty"?"fitness-last.empty.json":v==="multi"?"fitness-last.multi.json":"fitness-last.json";
      return new Response(await (await real(F+f)).text(),{status:200,headers:{"Content-Type":"application/json"}});
    }
    return new Response(JSON.stringify({code:200,success:true,data:[]}),{status:200,headers:{"Content-Type":"application/json"}});
  };
})();
