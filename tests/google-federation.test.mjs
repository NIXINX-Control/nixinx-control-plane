import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/google-federation.ts",import.meta.url),"utf8").replace('import "server-only";','');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {googleFederationBinding:b,assertProductionOidc,probeGoogleFederation,exchangeGoogleFederation}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
function token(overrides={}){
 const t=Math.floor(Date.now()/1000);
 const claims={iss:b.issuer,aud:b.audience,sub:b.subject,owner_id:b.ownerId,project_id:b.projectId,environment:"production",iat:t-1,nbf:t-1,exp:t+300,...overrides};
 return Buffer.from('{"alg":"RS256"}').toString("base64url")+"."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".signature";
}
test("preflight only accepts exact production binding and valid time",()=>{
 assert.ok(assertProductionOidc(token(),"production"));
 for(const o of [{owner_id:"other"},{project_id:"other"},{environment:"preview"},{iss:"https://oidc.vercel.com"},{aud:"wrong"},{sub:"other"},{exp:1},{nbf:9999999999},{iat:9999999999}])assert.throws(()=>assertProductionOidc(token(o),"production"));
 assert.throws(()=>assertProductionOidc(token(),"preview"),/PRODUCTION_ONLY/);
 assert.throws(()=>assertProductionOidc(null,"production"),/UNAVAILABLE/);
});
test("STS uses exact provider and does not return credential to probe",async()=>{
 const jwt=token();const result=await probeGoogleFederation(jwt,"production",async(url,opts)=>{
  assert.equal(url,"https://sts.googleapis.com/v1/token");assert.equal(opts.method,"POST");assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");assert.equal(opts.headers.Authorization,undefined);
  const body=JSON.parse(opts.body);assert.equal(body.audience,b.provider);assert.equal(body.subjectToken,jwt);assert.equal(body.grantType,"urn:ietf:params:oauth:grant-type:token-exchange");assert.equal(body.subjectTokenType,"urn:ietf:params:oauth:token-type:jwt");
  return Response.json({access_token:"private-sts-token",token_type:"Bearer",issued_token_type:"urn:ietf:params:oauth:token-type:access_token",expires_in:3600});
 });
 assert.equal(result.status,"STS_EXCHANGE_VERIFIED");assert.equal(result.clientDelegationVerified,false);assert.equal(result.operationPermissionsVerified,false);
 assert.ok(!JSON.stringify(result).includes("private-sts-token"));assert.ok(!JSON.stringify(result).includes(jwt));
});
test("provider rejection stays sanitized and no fallback on invalid token",async()=>{
 await assert.rejects(probeGoogleFederation(token(),"production",async()=>Response.json({error:"invalid_grant",error_description:"secret material"},{status:400})),e=>e.message==="GOOGLE_STS_INVALID_GRANT");
 let calls=0;await assert.rejects(exchangeGoogleFederation(token({project_id:"other"}),"production",async()=>{calls++;throw Error()}));assert.equal(calls,0);
 await assert.rejects(probeGoogleFederation(token(),"production",async()=>Response.json({access_token:"x",token_type:"Bearer",expires_in:3600})),/RESPONSE_INVALID/);
});
test("production probe is superadmin gated and never accepts client-provided target or token body",()=>{
 const route=fs.readFileSync(new URL("../src/app/api/admin/provisioning/connections/google/route.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("await superadminUser(req)")<route.indexOf('req.headers.get("x-vercel-oidc-token")'));assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));assert.ok(!/req\.(json|text)\(/.test(route));
});
