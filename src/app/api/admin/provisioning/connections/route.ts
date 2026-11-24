import {NextRequest} from "next/server";
import {superadminUser,ok,fail,ApiError,db} from "@/lib/server";
import {providerIds,parseCredentialInput} from "@/lib/provider-connections-policy";
import {connectionStatus,custodyProject,saveProviderToken,ProviderConnectionError} from "@/lib/provider-connections";
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
  try{input=parseCredentialInput(await req.json())}catch{throw new ApiError(400,"Invalid provider credential input")}
  let result;
  try{result=await saveProviderToken(input.provider,input.token)}catch(e){throw new ApiError(409,e instanceof ProviderConnectionError?e.message:"PROVIDER_CONNECTION_UNVERIFIED")}
  // Audit only provider name and actor; never log a token, payload, or upstream body.
  try{await db.collection("audit").add({actor,action:"PROVIDER_CREDENTIAL_UPDATED",target:input.provider,at:new Date().toISOString()})}catch{throw new ApiError(503,"Credential saved and verified; audit write failed. Verify connection before retrying.")}
  return ok(result);
 }catch(e){return fail(e)}
}
