// GOV-04: corporate App only, per-organization and per-repository token scope.
export const githubAppSlug="nixinx-control-provisioning";
export const githubAppOwner="NIXINX-Software";
export const githubAppId=5914516;
export const githubOwners=["NIXINX-Software","NIXINX-Managed","NIXINX-Business-Transformation","NIXINX-Control"] as const;
export const githubRootSecret="nixinx-provisioning-github-app-key";
export type GitHubRoot={appId:number;privateKey:string};
export function parseGithubRoot(v:unknown):GitHubRoot{
 if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("INVALID_GITHUB_APP_CREDENTIAL");
 const b=v as Record<string,unknown>;
 if(Object.keys(b).some(k=>!["appId","privateKey"].includes(k))||Number(b.appId)!==githubAppId||typeof b.privateKey!=="string"||b.privateKey.length>8192)throw new Error("INVALID_GITHUB_APP_CREDENTIAL");
 const pem=b.privateKey.trim().replace(/\r\n/g,"\n");
 if(!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END (?:RSA )?PRIVATE KEY-----$/.test(pem))throw new Error("INVALID_GITHUB_APP_KEY");
 return {appId:githubAppId,privateKey:pem+"\n"};
}
export function githubOwner(v:unknown){
 if(typeof v!=="string")throw new Error("GITHUB_OWNER_NOT_ALLOWED");
 const owner=githubOwners.find(o=>o.toLowerCase()===v.toLowerCase());
 if(!owner)throw new Error("GITHUB_OWNER_NOT_ALLOWED");
 return owner;
}
export function githubRepo(v:unknown){
 if(typeof v!=="string"||! /^[A-Za-z0-9_.-]{1,100}$/.test(v)||v==="."||v==="..")throw new Error("INVALID_GITHUB_REPO");
 return v;
}
export function verifyApp(v:unknown){
 const b=v as {id?:number;slug?:string;owner?:{login?:string}}|null;
 if(!b||b.id!==githubAppId||b.slug!==githubAppSlug||b.owner?.login?.toLowerCase()!==githubAppOwner.toLowerCase())throw new Error("GITHUB_APP_IDENTITY_MISMATCH");
}
export function verifyInstallation(v:unknown,owner:string){
 const b=v as {id?:number;app_id?:number;target_type?:string;account?:{login?:string};suspended_at?:unknown;permissions?:Record<string,string>}|null;
 if(!b||!Number.isSafeInteger(b.id)||Number(b.id)<=0||b.app_id!==githubAppId||b.target_type!=="Organization"||b.account?.login?.toLowerCase()!==githubOwner(owner).toLowerCase()||b.suspended_at!==null)throw new Error("GITHUB_INSTALLATION_UNVERIFIED");
 if(!["read","write"].includes(b.permissions?.contents??"")||!["read","write"].includes(b.permissions?.metadata??""))throw new Error("GITHUB_INSTALLATION_READ_PERMISSION_MISSING");
 return b.id!;
}
export function tokenRequest(repository?:string){
 return {permissions:{contents:"read",metadata:"read"},...(repository?{repositories:[githubRepo(repository)]}:{})};
}
export function parseInstallationToken(v:unknown,now=Date.now()){
 const b=v as {token?:string;expires_at?:string;permissions?:Record<string,string>}|null;
 if(!b||typeof b.token!=="string"||!/^ghs_[A-Za-z0-9_]+$/.test(b.token)||b.token.length>4096||typeof b.expires_at!=="string")throw new Error("GITHUB_INSTALLATION_TOKEN_UNVERIFIED");
 const expiresAt=Date.parse(b.expires_at);
 if(!Number.isFinite(expiresAt)||expiresAt<=now+60000||expiresAt>now+3900000)throw new Error("GITHUB_INSTALLATION_TOKEN_EXPIRY_INVALID");
 if(b.permissions?.contents!=="read"||b.permissions?.metadata!=="read"||Object.entries(b.permissions).some(([k,p])=>!["contents","metadata"].includes(k)&&p!=="read"))throw new Error("GITHUB_INSTALLATION_TOKEN_SCOPE_MISMATCH");
 return {token:b.token,expiresAt};
}
