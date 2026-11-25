import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code=fs.readFileSync(new URL("../src/lib/github-app-policy.ts",import.meta.url),"utf8");
const p=await import("data:text/javascript;base64,"+Buffer.from(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64"));
test("root is pinned to the registered corporate GitHub App",()=>{
 const privateKey="-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----";
 assert.equal(p.parseGithubRoot({appId:5914516,privateKey}).appId,5914516);
 assert.throws(()=>p.parseGithubRoot({appId:123,privateKey}));
 assert.throws(()=>p.parseGithubRoot({appId:5914516,privateKey:"ghp_personal"}));
 assert.throws(()=>p.parseGithubRoot({appId:5914516,privateKey,url:"https://example.org"}));
 p.verifyApp({id:5914516,slug:"nixinx-control-provisioning",owner:{login:"NIXINX-Software"}});
 assert.throws(()=>p.verifyApp({id:5914516,slug:"other",owner:{login:"NIXINX-Software"}}));
});
test("organization installation and permissions fail closed",()=>{
 const ins={id:123,app_id:5914516,target_type:"Organization",account:{login:"NIXINX-Software"},suspended_at:null,permissions:{contents:"write",metadata:"read"}};
 assert.equal(p.verifyInstallation(ins,"nixinx-software"),123);
 assert.throws(()=>p.verifyInstallation(ins,"nixinx-managed"));
 assert.throws(()=>p.verifyInstallation({...ins,suspended_at:"2026-11-24"},"NIXINX-Software"));
 assert.throws(()=>p.githubOwner("external"));
 assert.throws(()=>p.verifyInstallation({...ins,permissions:{}}, "NIXINX-Software"));
});
test("read discovery tokens are scoped and expiry verified",()=>{
 const now=Date.now(),t={token:"ghs_synthetic",expires_at:new Date(now+3600000).toISOString(),permissions:{contents:"read",metadata:"read"}};
 assert.deepEqual(p.tokenRequest("initiatives-portal"),{permissions:{contents:"read",metadata:"read"},repositories:["initiatives-portal"]});
 assert.throws(()=>p.tokenRequest("../other"));
 assert.equal(p.parseInstallationToken(t,now).token,"ghs_synthetic");
 assert.throws(()=>p.parseInstallationToken({...t,permissions:{contents:"write",metadata:"read"}},now));
 assert.throws(()=>p.parseInstallationToken({...t,permissions:{...t.permissions,administration:"write"}},now));
 assert.throws(()=>p.parseInstallationToken({...t,expires_at:new Date(now).toISOString()},now));
});

test("accepts both legacy and stateless installation tokens as opaque strings",()=>{
 const now=Date.now(),base={expires_at:new Date(now+3600000).toISOString(),permissions:{contents:"read",metadata:"read"}};
 for(const token of ["ghs_legacy123","ghs_5914516_eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ."+ "a_-Z".repeat(130)])assert.equal(p.parseInstallationToken({...base,token},now).token,token);
 for(const token of ["","a b","a\r\nb","a\u0000b"])assert.throws(()=>p.parseInstallationToken({...base,token},now));
 assert.throws(()=>p.parseInstallationToken({...base,token:"ghs_5914516_a.b.c",permissions:{contents:"write",metadata:"read"}},now));
});
