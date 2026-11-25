import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile=(name,replace=x=>x)=>"data:text/javascript;base64,"+Buffer.from(ts.transpileModule(replace(fs.readFileSync(new URL("../src/lib/"+name+".ts",import.meta.url),"utf8")),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64");
const discovery=compile("google-discovery");
const binding=compile("client-google-binding",s=>s.replace('"./google-discovery"',JSON.stringify(discovery)));
const federation=compile("google-federation",s=>s.replace('import "server-only";',''));
const {parseClientGoogleBinding,restoreClientGoogleBinding,sameBinding,providerFor,serviceAccountFor,assertProjectOwner}=await import(binding);
const {googleFederationBinding:b,exchangeGoogleFederation}=await import(federation);
const input={mode:"client",projectId:"example-client",projectNumber:"123456789",organizationId:"987654321",webAppId:"1:123456789:web:abcdef"};
test("binding derives local and corporate targets, never accepts arbitrary target",()=>{
 const x=parseClientGoogleBinding(input,"example","initiatives");assert.match(providerFor(x),/projects\/123456789\/.*nixinx-control-delegation/);assert.equal(serviceAccountFor(x),"nixinx-provisioning-discovery@example-client.iam.gserviceaccount.com");assert.equal(providerFor({...x,mode:"corporate"}),b.provider);
 assert.throws(()=>parseClientGoogleBinding({...input,provider:"evil"},"example","initiatives"));assert.throws(()=>parseClientGoogleBinding({...input,projectId:"nixinx-control"},"example","initiatives"));
 assert.throws(()=>restoreClientGoogleBinding(x,"other","initiatives"));assert.ok(sameBinding(x,restoreClientGoogleBinding(x,"example","initiatives")));
});
test("existing owner conflict denies cross-tenant access",()=>{const x=parseClientGoogleBinding(input,"example","initiatives");assert.throws(()=>assertProjectOwner({tenantId:"other",projectId:x.projectId},x));assert.doesNotThrow(()=>assertProjectOwner({tenantId:"example",projectId:x.projectId},x))});
test("local STS audience follows derived provider; rejects arbitrary URL",async()=>{
 const t=Math.floor(Date.now()/1000),claims={iss:b.issuer,aud:b.audience,sub:b.subject,owner_id:b.ownerId,project_id:b.projectId,environment:"production",iat:t-1,nbf:t-1,exp:t+300};const jwt="e30."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".signature";
 const target=providerFor(parseClientGoogleBinding(input,"example","initiatives"));
 await exchangeGoogleFederation(jwt,"production",async(url,opts)=>{assert.equal(url,"https://sts.googleapis.com/v1/token");assert.equal(JSON.parse(opts.body).audience,target);return Response.json({access_token:"private",token_type:"Bearer",issued_token_type:"urn:ietf:params:oauth:token-type:access_token",expires_in:3600})},target);
 await assert.rejects(exchangeGoogleFederation(jwt,"production",async()=>{throw Error("unexpected") },"https://evil.invalid"),/PROVIDER_INVALID/);
});
test("discovery action accepts only tenant selection and uses persisted binding",()=>{const src=fs.readFileSync(new URL("../src/app/api/admin/provisioning/client/google/route.ts",import.meta.url),"utf8");assert.ok(src.includes('["action","tenantId"]'));assert.ok(src.includes('restoreClientGoogleBinding(d!.googleBinding'));assert.ok(src.includes('assertProjectOwner(owner.data(),b)'));assert.ok(src.includes('await superadminUser(req)'));});
