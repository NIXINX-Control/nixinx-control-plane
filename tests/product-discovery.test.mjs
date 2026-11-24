import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/product-discovery.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {parseProductDiscoveryInput,parseProductManifest,reconcileProduct}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const input=parseProductDiscoveryInput({appId:"initiatives",repository:"NIXINX-Software/initiatives-portal",vercelProjectId:"prj_synthetic123"});
const requirements={schemaVersion:1,hosting:"vercel-shared",dataPlane:["firebase-auth","firestore"],firebaseWebConfigKeys:["apiKey","projectId"],firestoreCollections:["portal_initiatives"],accessModes:["operational-without-individual-login","email-password-admin"],rulesSource:{path:"src/lib/firestore-portal-rules.ts",kind:"reference-only"},runtimeBinding:"pending",dataAuthorization:"pending",conditionalResources:["cloud-run","secret-manager"],notEvidencedResources:["bigquery","stripe"]};
const manifest={schemaVersion:1,applicationId:"initiatives",applicationName:"Initiatives",source:"src/components/portal/portal-dashboard.tsx",moduleSource:"type PortalView",modules:[{id:"initiatives",name:"Iniciativas"},{id:"kpis",name:"KPIs"}],requirements};
const teamId="team_synthetic123";
const snapshot={repository:{full_name:input.repository,private:true,archived:false,default_branch:"main"},branch:{name:"main",commit:{sha:"a".repeat(40)}},manifest,project:{id:input.vercelProjectId,accountId:teamId,link:{type:"github",org:"NIXINX-Software",repo:"initiatives-portal",productionBranch:"main"}},teamId};
test("matching product discovery remains read-only and cannot grant readiness",()=>{
 const p=reconcileProduct(input,snapshot);
 assert.equal(p.sourceCommit,"a".repeat(40));assert.equal(p.technicalReady,false);assert.equal(p.commercialAuthorized,false);assert.equal(p.writes,0);assert.equal(p.manifest.modules.length,2);
});
test("reject provider identity, repository, branch and scope mismatches",()=>{
 for(const s of [{...snapshot,repository:{...snapshot.repository,private:false}},{...snapshot,repository:{...snapshot.repository,full_name:"other/repo"}},{...snapshot,branch:{name:"main",commit:{sha:"not-a-sha"}}},{...snapshot,project:{...snapshot.project,accountId:"team_other"}},{...snapshot,project:{...snapshot.project,link:null}},{...snapshot,project:{...snapshot.project,link:{...snapshot.project.link,repo:"supply"}}}])assert.throws(()=>reconcileProduct(input,s));
});
test("legacy v1 manifest parses but requirements remain missing",()=>{
 const {requirements,...legacy}=manifest;
 assert.equal(parseProductManifest(legacy,"initiatives").requirements,null);
 assert.equal(reconcileProduct(input,{...snapshot,manifest:legacy}).steps[1].action,"VERIFY");
});
test("reject duplicates, unrelated app, invented verified state and credential field",()=>{
 for(const m of [{...manifest,applicationId:"supply"},{...manifest,modules:[manifest.modules[0],manifest.modules[0]]},{...manifest,requirements:{...requirements,runtimeBinding:"ready"}},{...manifest,requirements:{...requirements,privateKey:"secret"}},{...manifest,requirements:{...requirements,conditionalResources:["stripe"]}}])assert.throws(()=>parseProductManifest(m,"initiatives"));
});
test("request accepts exact provider identifiers, never URL or secret",()=>{
 for(const v of [{...input,repository:"https://example.test/foo"},{...input,repository:"other/repo"},{...input,vercelProjectId:"../../other"},{...input,token:"secret"}])assert.throws(()=>parseProductDiscoveryInput(v));
});
