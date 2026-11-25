// GOV-04: only the corporate integration, approved team and state-bound installation.
export const vercelSlug="nixinx-control-provisioning";
export const vercelCallback="https://controlde.nixinx.org/api/integrations/vercel/callback";
export const vercelRootSecret="nixinx-provisioning-vercel-integration-root";
export const corporateTeam="team_7GCW65202sW0sdYEgH3LDeFE";
export type VercelRoot={clientId:string;clientSecret:string};
export function parseVercelRoot(v:unknown):VercelRoot{
 if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("INVALID_VERCEL_ROOT");
 const b=v as Record<string,unknown>;
 if(Object.keys(b).some(k=>!["clientId","clientSecret"].includes(k))||typeof b.clientId!=="string"||!/^oac_[A-Za-z0-9_-]{8,100}$/.test(b.clientId)||typeof b.clientSecret!=="string"||b.clientSecret.length<16||b.clientSecret.length>512||!/^[\x21-\x7e]+$/.test(b.clientSecret))throw new Error("INVALID_VERCEL_ROOT");
 return {clientId:b.clientId,clientSecret:b.clientSecret};
}
export function installationId(v:unknown):v is string{return typeof v==="string"&&/^icfg_[A-Za-z0-9_-]{8,100}$/.test(v)}
export function verifyExchange(v:unknown,expected:string){
 const b=v as {installation_id?:string;team_id?:string}|null;
 if(!b||b.team_id!==corporateTeam||!installationId(b.installation_id)||b.installation_id!==expected)throw new Error("VERCEL_INSTALLATION_MISMATCH");
 return b.installation_id;
}
export function parseShortToken(v:unknown,id:string,now=Date.now()){
 const b=v as {access_token?:string;token_type?:string;expires_in?:number;installation_id?:string;team_id?:string;scope?:string}|null;
 if(!b||b.team_id!==corporateTeam||b.installation_id!==id||b.token_type?.toLowerCase()!=="bearer"||typeof b.access_token!=="string"||b.access_token.length<16||b.access_token.length>8192||! /^[\x21-\x7e]+$/.test(b.access_token)||typeof b.expires_in!=="number"||!Number.isFinite(b.expires_in)||b.expires_in<120||b.expires_in>3900||typeof b.scope!=="string")throw new Error("VERCEL_SHORT_TOKEN_UNVERIFIED");
 const scopes=b.scope.split(/\s+/);
 if(!["read:project","write:project"].some(s=>scopes.includes(s))||!["read:team","write:team"].some(s=>scopes.includes(s))||!["read:integration-configuration","write:integration-configuration"].some(s=>scopes.includes(s)))throw new Error("VERCEL_REQUIRED_READ_SCOPES_MISSING");
 return {token:b.access_token,expiresAt:now+b.expires_in*1000};
}
export function safeNext(v:string|null){
 if(!v)return "https://controlde.nixinx.org/";
 try{const u=new URL(v);if(u.protocol==="https:"&&u.hostname==="vercel.com"&&!u.port&&!u.username&&!u.password)return u.href}catch{}
 return "https://controlde.nixinx.org/";
}
export function parseCallback(q:URLSearchParams){
 for(const k of ["code","state","teamId","configurationId","next","source"])if(q.getAll(k).length>1)throw new Error("VERCEL_CALLBACK_INVALID");
 const code=q.get("code"),state=q.get("state"),id=q.get("configurationId");
 if(!code||code.length>2048||! /^[\x21-\x7e]+$/.test(code)||!state||! /^[a-f0-9]{64}$/.test(state)||!installationId(id)||q.get("source")!=="external"||q.get("teamId")!==corporateTeam)throw new Error("VERCEL_CALLBACK_INVALID");
 return {code,state,id,next:safeNext(q.get("next"))};
}
