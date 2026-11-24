// No secrets are returned to the browser or stored in Firestore.
export const providerIds=["github","vercel"] as const;
export type ProviderId=(typeof providerIds)[number];
export const secretIds:Record<ProviderId,string>={github:"nixinx-provisioning-github-token",vercel:"nixinx-provisioning-vercel-token"};
export const envNames:Record<ProviderId,string>={github:"NIXINX_PROVISIONING_GITHUB_READ_TOKEN",vercel:"NIXINX_PROVISIONING_VERCEL_READ_TOKEN"};
export function isProviderId(v:unknown):v is ProviderId{return typeof v==="string"&&providerIds.some(p=>p===v)}
export function validProject(v:unknown):v is string{return typeof v==="string"&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v)}
export function validTeam(v:unknown):v is string{return typeof v==="string"&&/^team_[A-Za-z0-9]{8,80}$/.test(v)}
export function validToken(v:unknown):v is string{return typeof v==="string"&&v.length>=16&&v.length<=4096&&/^[A-Za-z0-9._-]+$/.test(v)}
export function probeUrl(id:ProviderId,team:string){
 if(id==="github")return "https://api.github.com/user";
 if(!validTeam(team))throw new Error("VERCEL_TEAM_NOT_CONFIGURED");
 return "https://api.vercel.com/v2/teams/"+encodeURIComponent(team);
}
export function probeResult(id:ProviderId,status:number,body:unknown,team:string){
 if(status===401||status===403)return "ACCESS_DENIED" as const;
 if(status!==200)return "UNVERIFIED" as const;
 const b=body as Record<string,unknown>|null;
 if(!b||typeof b!=="object")return "UNVERIFIED" as const;
 // GitHub installation tokens are not user tokens. The user probe does not certify repository scopes.
 if(id==="github")return typeof b.login==="string"&&typeof b.id==="number"?"IDENTITY_VERIFIED" as const:"UNVERIFIED" as const;
 return b.id===team?"IDENTITY_VERIFIED" as const:"UNVERIFIED" as const;
}
export function parseCredentialInput(v:unknown){
 if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("INVALID_INPUT");
 const b=v as Record<string,unknown>;
 if(Object.keys(b).some(k=>!["provider","token"].includes(k))||!isProviderId(b.provider)||!validToken(b.token))throw new Error("INVALID_INPUT");
 return {provider:b.provider,token:b.token};
}
