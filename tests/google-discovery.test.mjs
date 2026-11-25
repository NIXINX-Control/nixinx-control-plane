import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/google-discovery.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {discoverGoogleProject,validateGoogleBinding}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const b={projectId:"example-client",projectNumber:"123456789",organizationId:"987654321",webAppId:"1:123456789:web:abcdef"};
function mock(override={}){
 const calls=[];
 const request=async (url,opts)=>{
  calls.push({url,method:opts.method});
  assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");
  const u=new URL(url);let data;
  if(u.hostname==="cloudresourcemanager.googleapis.com")data={name:"projects/"+b.projectNumber,projectId:b.projectId,parent:"organizations/"+b.organizationId,state:"ACTIVE",...override.project};
  else if(u.pathname.endsWith("/webApps"))data={apps:[{appId:b.webAppId,projectId:b.projectId,state:"ACTIVE"}],...override.apps};
  else if(u.hostname==="firebase.googleapis.com")data={projectId:b.projectId,projectNumber:b.projectNumber,...override.firebase};
  else if(u.hostname==="cloudbilling.googleapis.com"){if(override.denied)return new Response("forbidden",{status:403});data={projectId:b.projectId,billingEnabled:true,billingAccountName:"billingAccounts/private",...override.billing}}
  else if(u.hostname==="serviceusage.googleapis.com")data=u.searchParams.has("pageToken")?{services:[{config:{name:"firestore.googleapis.com"}}]}:{services:[{config:{name:"firebase.googleapis.com"}}],nextPageToken:"second"};
  else if(u.hostname==="firestore.googleapis.com")data={databases:[{name:"projects/"+b.projectId+"/databases/(default)",locationId:"nam5",type:"FIRESTORE_NATIVE"}],...override.databases};
  else throw Error("unexpected endpoint");
  return Response.json(data);
 };return {request,calls};
}
test("reads scoped metadata and paginates without exposing credentials or billing ID",async()=>{
 const m=mock();const result=await discoverGoogleProject(b,"test-token",m.request);
 assert.equal(result.billingAccountLinked,true);assert.equal(result.webAppCount,1);assert.equal(result.databases.length,1);
 assert.deepEqual(result.enabledServices,["firebase.googleapis.com","firestore.googleapis.com"]);
 assert.equal(result.technicalReady,false);assert.equal(result.commercialAuthorized,false);
 assert.ok(!JSON.stringify(result).includes("private"));assert.ok(!JSON.stringify(result).includes("test-token"));
 assert.ok(m.calls.every(c=>!c.url.includes("/documents")));
});
test("rejects mismatched project, organization, web app and billing",async()=>{
 for(const [o,pattern] of [[{project:{parent:"organizations/9"}},/PROJECT_BINDING_MISMATCH/],[{firebase:{projectId:"other"}},/PROJECT_BINDING_MISMATCH/],[{apps:{apps:[]}},/WEB_APP_NOT_RECONCILED/],[{billing:{projectId:"other"}},/BILLING_BINDING_MISMATCH/]])await assert.rejects(discoverGoogleProject(b,"test-token",mock(o).request),pattern);
});
test("denied billing is not interpreted as missing, partial database inventory stops",async()=>{
 await assert.rejects(discoverGoogleProject(b,"test-token",mock({denied:true}).request),/GOOGLE_BILLING_ACCESS_DENIED/);
 await assert.rejects(discoverGoogleProject(b,"test-token",mock({databases:{unreachable:["region"]}}).request),/INCOMPLETE/);
});
test("rejects unsafe binding or missing token before external requests",async()=>{
 assert.throws(()=>validateGoogleBinding({...b,webAppId:"1:444:web:abcdef"}));
 const m=mock();await assert.rejects(discoverGoogleProject(b,"",m.request),/TOKEN_REQUIRED/);assert.equal(m.calls.length,0);
});
