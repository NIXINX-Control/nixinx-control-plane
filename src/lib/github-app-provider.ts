import "server-only";
import {createPrivateKey,sign} from "node:crypto";
import {githubAppOwner,githubOwner,githubRepo,parseGithubRoot,verifyApp,verifyInstallation,tokenRequest,parseInstallationToken,type GitHubRoot} from "@/lib/github-app-policy";
import {readGithubRoot,writeGithubRoot,ProviderConnectionError} from "@/lib/control-secret-vault";
function jwt(root:GitHubRoot){
 try{
  const key=createPrivateKey(root.privateKey);
  if(key.asymmetricKeyType!=="rsa"||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw new Error();
  const now=Math.floor(Date.now()/1000);
  const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  const body=enc({alg:"RS256",typ:"JWT"})+"."+enc({iat:now-60,exp:now+540,iss:String(root.appId)});
  return body+"."+sign("RSA-SHA256",Buffer.from(body),key).toString("base64url");
 }catch{throw new ProviderConnectionError("INVALID_GITHUB_APP_KEY")}
}
async function api(path:string,bearer:string,body?:unknown){
 let res:Response;
 try{res=await fetch("https://api.github.com"+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+bearer,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)})}catch{throw new ProviderConnectionError("GITHUB_API_UNAVAILABLE")}
 if(!res.ok)throw new ProviderConnectionError(res.status===404?"GITHUB_RESOURCE_OR_INSTALLATION_MISSING":res.status===401||res.status===403?"GITHUB_ACCESS_DENIED":"GITHUB_API_UNVERIFIED");
 return res.json();
}
async function issue(root:GitHubRoot,owner:string,repository?:string){
 const org=githubOwner(owner),repo=repository?githubRepo(repository):undefined;
 const auth=jwt(root);
 verifyApp(await api("/app",auth));
 const id=verifyInstallation(await api("/orgs/"+encodeURIComponent(org)+"/installation",auth),org);
 if(repo){
  const repoId=verifyInstallation(await api("/repos/"+encodeURIComponent(org)+"/"+encodeURIComponent(repo)+"/installation",auth),org);
  if(repoId!==id)throw new ProviderConnectionError("GITHUB_REPOSITORY_INSTALLATION_MISMATCH");
 }
 // Short-lived read-only token, restricted to the exact repo for discovery.
 // Mint on demand rather than cache across invocations; no access token persisted.
 const token=parseInstallationToken(await api("/app/installations/"+id+"/access_tokens",auth,tokenRequest(repo)));
 return {...token,installationId:id};
}
async function storedRoot(){
 try{return parseGithubRoot(JSON.parse(await readGithubRoot()))}catch(e){if(e instanceof ProviderConnectionError)throw e;throw new ProviderConnectionError("VAULT_GITHUB_ROOT_INVALID")}
}
function safeStatus(e:unknown){
 const message=e instanceof Error?e.message:"";
 return /^[A-Z][A-Z0-9_]{1,80}$/.test(message)?message:"GITHUB_APP_UNVERIFIED";
}
export async function getGithubRepositoryToken(repository:string){
 const parts=repository.split("/");
 if(parts.length!==2)throw new ProviderConnectionError("INVALID_GITHUB_REPO");
 try{return (await issue(await storedRoot(),parts[0],parts[1])).token}catch(e){throw new ProviderConnectionError(safeStatus(e))}
}
async function validateRoot(root:GitHubRoot){
 const access=await issue(root,githubAppOwner);
 const repos=await api("/installation/repositories?per_page=1",access.token);
 if(!Array.isArray(repos?.repositories)||!Number.isSafeInteger(repos?.total_count))throw new ProviderConnectionError("GITHUB_INSTALLATION_READ_UNVERIFIED");
 return {installationId:access.installationId,expiresAt:new Date(access.expiresAt).toISOString()};
}
export async function githubConnectionStatus(){
 try{const evidence=await validateRoot(await storedRoot());return {provider:"github",custody:"SECRET_MANAGER",status:"IDENTITY_VERIFIED",operationPermissionsVerified:false,...evidence}}
 catch(e){return {provider:"github",custody:"SECRET_MANAGER",status:safeStatus(e),operationPermissionsVerified:false}}
}
export async function saveGithubRoot(input:GitHubRoot){
 const root=parseGithubRoot(input);
 try{
  const evidence=await validateRoot(root);
  const value=JSON.stringify(root);
  try{if(await readGithubRoot()===value)return {...evidence,changed:false}}catch(e){if(!(e instanceof ProviderConnectionError)||e.message!=="VAULT_SECRET_OR_VERSION_MISSING")throw e}
  await writeGithubRoot(value);
  return {...evidence,changed:true};
 }catch(e){throw new ProviderConnectionError(safeStatus(e))}
}
