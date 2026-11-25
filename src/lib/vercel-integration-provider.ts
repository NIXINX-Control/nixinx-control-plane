import "server-only";
import {createHash,randomBytes} from "node:crypto";
import {db} from "@/lib/server";
import {readVercelRoot,writeVercelRoot,ProviderConnectionError} from "@/lib/control-secret-vault";
import {parseVercelRoot,installationId,verifyExchange,parseShortToken,corporateTeam,vercelCallback,privateInstallUrl,type VercelRoot} from "@/lib/vercel-integration-policy";
const config=()=>db.collection("providerConnections").doc("vercel");
const states=()=>db.collection("providerAuthorizationStates");
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
const fingerprint=(v:VercelRoot)=>digest(JSON.stringify(v));
function expectedTeam(){if(process.env.NIXINX_PROVISIONING_VERCEL_TEAM_ID!==corporateTeam)throw new ProviderConnectionError("VERCEL_TEAM_NOT_CONFIGURED");return corporateTeam}
function safe(e:unknown){const m=e instanceof Error?e.message:"";return /^[A-Z][A-Z0-9_]{1,80}$/.test(m)?m:"VERCEL_INTEGRATION_UNVERIFIED"}
async function storedRoot(){try{return parseVercelRoot(JSON.parse(await readVercelRoot()))}catch(e){if(e instanceof ProviderConnectionError)throw e;throw new ProviderConnectionError("VAULT_VERCEL_ROOT_INVALID")}}
async function tokenCall(root:VercelRoot,fields:Record<string,string>){
 const exchange=fields.grant_type==="authorization_code";
 const form=exchange?{...fields,client_id:root.clientId,client_secret:root.clientSecret}:fields;
 let r:Response;
 try{r=await fetch("https://api.vercel.com/v2/oauth/access_token",{method:"POST",headers:{...(exchange?{}:{Authorization:"Basic "+Buffer.from(root.clientId+":"+root.clientSecret).toString("base64")}),"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams(form),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)})}catch{throw new ProviderConnectionError("VERCEL_TOKEN_ENDPOINT_UNAVAILABLE")}
 if(!r.ok)throw new ProviderConnectionError(r.status===429?"VERCEL_TOKEN_RATE_LIMITED":r.status===401||r.status===403?"VERCEL_AUTHORIZATION_DENIED":"VERCEL_TOKEN_EXCHANGE_FAILED");
 return r.json();
}
async function verifyTeam(token:string){
 const r=await fetch("https://api.vercel.com/v2/teams/"+expectedTeam(),{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw new ProviderConnectionError("VERCEL_TEAM_READ_FAILED");
 const b=await r.json();
 if(b.id!==corporateTeam)throw new ProviderConnectionError("VERCEL_TEAM_MISMATCH");
}
async function verifyInstallationRead(token:string,id:string){
 const team=expectedTeam();
 const headers={Authorization:"Bearer "+token,Accept:"application/json"};
 const [c,p]=await Promise.all([
  fetch("https://api.vercel.com/v1/integrations/configuration/"+id+"?teamId="+team,{headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)}),
  fetch("https://api.vercel.com/v9/projects?teamId="+team+"&limit=1",{headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)})
 ]);
 if(!c.ok||!p.ok)throw new ProviderConnectionError("VERCEL_INSTALLATION_READ_SCOPE_UNVERIFIED");
 const [configuration,projects]=await Promise.all([c.json(),p.json()]);
 if(configuration.id!==id||!Array.isArray(projects.projects))throw new ProviderConnectionError("VERCEL_INSTALLATION_READ_UNVERIFIED");
}
async function issue(root:VercelRoot,id:string){
 expectedTeam();
 return parseShortToken(await tokenCall(root,{grant_type:"client_credentials",installation_id:id}),id);
}
let cached:{key:string;token:string;expiresAt:number}|undefined;
let pending:{key:string;promise:Promise<{token:string;expiresAt:number}>}|undefined;
async function active(){
 const root=await storedRoot();
 const d=(await config().get()).data();
 if(!d||!installationId(d.installationId)||d.teamId!==expectedTeam()||d.rootFingerprint!==fingerprint(root)||d.status!=="AUTHORIZED")throw new ProviderConnectionError("VERCEL_INSTALLATION_PENDING");
 return {root,id:d.installationId as string};
}
async function tokenFor(root:VercelRoot,id:string,fresh=false){
 const key=fingerprint(root)+":"+id;
 if(!fresh&&cached?.key===key&&cached.expiresAt>Date.now()+120000)return cached;
 if(pending?.key===key)return pending.promise;
 const promise=issue(root,id).then(t=>{cached={key,...t};return t}).finally(()=>{if(pending?.promise===promise)pending=undefined});
 pending={key,promise};return promise;
}
export async function getVercelIntegrationToken(){
 try{const {root,id}=await active();return (await tokenFor(root,id)).token}catch(e){throw new ProviderConnectionError(safe(e))}
}
export async function vercelConnectionStatus(){
 try{
  const {root,id}=await active(),t=await tokenFor(root,id,true);
  await Promise.all([verifyTeam(t.token),verifyInstallationRead(t.token,id)]);
  return {provider:"vercel",custody:"SECRET_MANAGER",status:"IDENTITY_VERIFIED",operationPermissionsVerified:false,installationId:id,expiresAt:new Date(t.expiresAt).toISOString()};
 }catch(e){return {provider:"vercel",custody:"SECRET_MANAGER",status:safe(e),operationPermissionsVerified:false}}
}
export async function saveVercelRoot(value:VercelRoot,actor:string){
 const root=parseVercelRoot(value),serialized=JSON.stringify(root);
 expectedTeam();
 const receipt=db.collection("audit").doc();
 await receipt.create({actor,action:"VERCEL_ROOT_UPDATE_REQUESTED",target:"vercel-integration",status:"REQUESTED",at:new Date().toISOString()});
 try{
  const bound=(await config().get()).data();
  let existing:string|undefined;
  try{existing=await readVercelRoot()}catch(e){if(!(e instanceof ProviderConnectionError)||e.message!=="VAULT_SECRET_OR_VERSION_MISSING")throw e}
  if(existing!==serialized){
   if(bound?.installationId)throw new ProviderConnectionError("VERCEL_ROOT_ROTATION_REQUIRES_CONTROLLED_PROCEDURE");
   await writeVercelRoot(serialized);
  }
  await receipt.update({status:existing===serialized?"UNCHANGED":"ROOT_STORED_UNVERIFIED",completedAt:new Date().toISOString()});
  return {status:"ROOT_STORED_UNVERIFIED"};
 }catch(e){await receipt.update({status:"VERIFY_REQUIRED"}).catch(()=>{});throw new ProviderConnectionError(safe(e))}
}
export async function startVercelAuthorization(actor:string){
 expectedTeam();
 const root=await storedRoot(),state=randomBytes(32).toString("hex");
 const existing=(await config().get()).data();
 if(existing?.installationId)throw new ProviderConnectionError("VERCEL_INSTALLATION_ALREADY_BOUND");
 await states().doc(digest(state)).create({actor,rootFingerprint:fingerprint(root),teamId:corporateTeam,status:"PENDING",expiresAt:Date.now()+15*60000,createdAt:new Date().toISOString()});
 return {state,url:privateInstallUrl};
}
export async function finishVercelAuthorization(input:{state:string;code:string;id:string},confirmedActor?:string){
 const ref=states().doc(digest(input.state));
 const root=await storedRoot();
 const actor=await db.runTransaction(async tx=>{
  const d=(await tx.get(ref)).data();
  if(!d||d.status!=="PENDING"||typeof d.actor!=="string"||(confirmedActor!==undefined&&d.actor!==confirmedActor)||d.teamId!==expectedTeam()||d.rootFingerprint!==fingerprint(root)||typeof d.expiresAt!=="number"||d.expiresAt<Date.now())throw new ProviderConnectionError("VERCEL_STATE_EXPIRED_OR_USED");
  tx.update(ref,{status:"CONSUMED",consumedAt:new Date().toISOString()});
  return d.actor as string;
 });
 try{
  // Never persist or use the code exchange access_token. Validate returned installation identity.
  const exchange=await tokenCall(root,{grant_type:"authorization_code",code:input.code,redirect_uri:vercelCallback});
  const id=verifyExchange(exchange,input.id);
  const t=await issue(root,id);
  await Promise.all([verifyTeam(t.token),verifyInstallationRead(t.token,id)]);
  // Re-read root before binding; mismatched root fingerprints always fail closed at token use.
  if(fingerprint(await storedRoot())!==fingerprint(root))throw new ProviderConnectionError("VERCEL_ROOT_CHANGED");
  await db.runTransaction(async tx=>{
   const d=(await tx.get(config())).data();
   if(d?.installationId&&d.installationId!==id)throw new ProviderConnectionError("VERCEL_INSTALLATION_ALREADY_BOUND");
   tx.set(config(),{installationId:id,teamId:corporateTeam,rootFingerprint:fingerprint(root),status:"AUTHORIZED",authorizedBy:actor,authorizedAt:new Date().toISOString()});
   tx.update(ref,{status:"AUTHORIZED",completedAt:new Date().toISOString()});
   tx.create(db.collection("audit").doc(),{actor,action:"VERCEL_INTEGRATION_AUTHORIZED",target:id,at:new Date().toISOString()});
  });
 }catch(e){await ref.update({status:"VERIFY_REQUIRED",completedAt:new Date().toISOString()}).catch(()=>{});throw new ProviderConnectionError(safe(e))}
}
