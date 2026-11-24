import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/product-registration-plan.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {buildProductRegistrationPlan:plan}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const d={appId:"initiatives",repository:"NIXINX-Software/initiatives-portal",sourceCommit:"a".repeat(40),vercelProjectId:"prj_synthetic",manifest:{applicationName:"Initiatives",requirements:{},modules:[{id:"initiatives",name:"Iniciativas"},{id:"kpis",name:"KPIs"}]}};
const app={id:"initiatives",data:{name:"Initiatives",status:"active"}};
const mod=(id,name,status="draft",verified=false)=>({id:"initiatives."+id,data:{appId:"initiatives",moduleId:id,name,status,verified}});
const m=mod("initiatives","Iniciativas"),k=mod("kpis","KPIs","active",true);
test("new product proposes only missing app and draft modules, never applies",()=>{
 const p=plan(d,{apps:[],modules:[]});
 assert.equal(p.steps.filter(x=>x.action==="CREATE_CANDIDATE").length,3);
 assert.equal(p.candidateModuleCount,2);assert.equal(p.writes,0);assert.equal(p.applyAuthorized,false);
 assert.equal(p.commercialAuthorized,false);assert.equal(p.technicalReady,false);
});
test("repeat same snapshot is deterministic; existing modules never recreated or downgraded",()=>{
 const s={apps:[app],modules:[m,k]};
 const prior=JSON.stringify(s),p=plan(d,s);
 assert.deepEqual(p,plan(d,s));assert.equal(JSON.stringify(s),prior);
 assert.equal(p.candidateModuleCount,0);assert.equal(p.steps.filter(x=>x.action==="REUSE").length,2);
 assert.equal(p.status,"REVIEW_REQUIRED");
 assert.ok(p.steps.some(x=>x.reason==="EXISTING_APP_BINDING_NOT_ATTESTED"));
});
test("partial product proposes only missing module; unrelated product is unaffected",()=>{
 const p=plan(d,{apps:[app],modules:[m,{id:"supply.kpis",data:{appId:"supply",moduleId:"kpis",status:"active",verified:true}}]});
 assert.equal(p.candidateModuleCount,1);assert.ok(p.steps.some(x=>x.id==="initiatives.kpis"&&x.action==="CREATE_CANDIDATE"));
 assert.ok(!p.steps.some(x=>x.id==="supply.kpis"));
});
test("case-only app and module conflicts, orphan modules and mismatched binding block",()=>{
 for(const s of [{apps:[{...app,id:"Initiatives"}],modules:[]},{apps:[],modules:[m]},{apps:[app],modules:[{...m,id:"Initiatives.initiatives"}]},{apps:[app],modules:[{...m,data:{...m.data,appId:"supply"}}]},{apps:[app],modules:[{...m,id:"initiatives.legacy"}]}])assert.equal(plan(d,s).status,"BLOCKED");
});
test("retirement, inconsistent verification and archived app remain blocked",()=>{
 for(const s of [{apps:[{...app,data:{...app.data,status:"archived"}}],modules:[]},{apps:[app],modules:[mod("kpis","KPIs","retired",true)]},{apps:[app],modules:[mod("kpis","KPIs","active",false)]}])assert.equal(plan(d,s).status,"BLOCKED");
});
test("names and extra historical modules are preserved for review",()=>{
 const p=plan(d,{apps:[{...app,data:{...app.data,name:"Legacy label"}}],modules:[mod("initiatives","Legacy name"),mod("old","Old")]});
 assert.ok(p.steps.some(x=>x.reason==="EXISTING_APP_NAME_DIFFERS_PRESERVE"));
 assert.ok(p.steps.some(x=>x.reason==="MODULE_NAME_DIFFERS_PRESERVE"));
 assert.ok(p.steps.some(x=>x.reason==="EXTRA_OR_LEGACY_MODULE_PRESERVE"));
});
test("requirements missing and incomplete or duplicate snapshots fail closed",()=>{
 assert.equal(plan({...d,manifest:{...d.manifest,requirements:null}},{apps:[],modules:[]}).status,"BLOCKED");
 assert.throws(()=>plan(d,{apps:[app,app],modules:[]}));
 assert.throws(()=>plan(d,{apps:Array.from({length:501},(_,i)=>({id:String(i),data:{}})),modules:[]}));
});
