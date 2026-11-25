import {NextRequest} from "next/server";
import {superadminUser,ok,fail,ApiError,db} from "@/lib/server";
import {providerIds} from "@/lib/provider-connections-policy";
import {connectionStatus,custodyProject,ProviderConnectionError} from "@/lib/provider-connections";
import {parseGithubRoot} from "@/lib/github-app-policy";
import {saveGithubRoot} from "@/lib/github-app-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  await superadminUser(req);
  let vaultConfigured=false;
  try{vaultConfigured=Boolean(custodyProject())}catch{}
  return ok({vaultConfigured,connections:await Promise.all(providerIds.map(connectionStatus))});
 }catch(e){return fail(e)}
}
export async function POST(req:NextRequest){
 try{
  const actor=await superadminUser(req);
  let input;
  try{
   const raw=await req.text();
   if(raw.length>12000)throw new Error();
   const body=JSON.parse(raw);
   if(body?.provider!=="github"||Object.keys(body).some(k=>!["provider","appId","privateKey"].includes(k)))throw new Error();
   input=parseGithubRoot({appId:body.appId,privateKey:body.privateKey});
  }catch{throw new ApiError(400,"INVALID_GITHUB_APP_CREDENTIAL")}
  const receipt=db.collection("audit").doc();
  await receipt.create({actor,action:"PROVIDER_CREDENTIAL_UPDATE_REQUESTED",target:"github-app",at:new Date().toISOString(),status:"REQUESTED"});
  let result;
  try{result=await saveGithubRoot(input)}catch(e){await receipt.update({status:"VERIFY_REQUIRED"}).catch(()=>{});throw new ApiError(409,e instanceof ProviderConnectionError?e.message:"GITHUB_APP_UNVERIFIED")}
  try{await receipt.update({status:result.changed?"UPDATED":"UNCHANGED",completedAt:new Date().toISOString()})}catch{throw new ApiError(503,"Credential saved and verified; audit write failed. Verify connection before retrying.")}
  return ok({provider:"github",status:"IDENTITY_VERIFIED",custody:"SECRET_MANAGER",operationPermissionsVerified:false,...result});
 }catch(e){return fail(e)}
}
