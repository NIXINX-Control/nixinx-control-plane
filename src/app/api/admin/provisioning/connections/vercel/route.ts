import {NextRequest} from "next/server";
import {superadminUser,ok,fail,ApiError} from "@/lib/server";
import {parseVercelRoot} from "@/lib/vercel-integration-policy";
import {saveVercelRoot,startVercelAuthorization} from "@/lib/vercel-integration-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const actor=await superadminUser(req);
  const raw=await req.text();
  if(raw.length>2048)throw new ApiError(400,"INVALID_VERCEL_ROOT");
  let body;
  try{body=JSON.parse(raw)}catch{throw new ApiError(400,"INVALID_INPUT")}
  if(body?.action==="start"&&Object.keys(body).length===1){
   let start;
   try{start=await startVercelAuthorization(actor)}catch{throw new ApiError(409,"VERCEL_AUTHORIZATION_START_UNVERIFIED")}
   const res=ok({url:start.url});
   res.headers.set("Set-Cookie","nx_vercel_state="+start.state+"; Path=/api/integrations/vercel/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=900");
   return res;
  }
  if(body?.action!=="saveRoot"||Object.keys(body).some(k=>!["action","clientId","clientSecret"].includes(k)))throw new ApiError(400,"INVALID_INPUT");
  let root;
  try{root=parseVercelRoot({clientId:body.clientId,clientSecret:body.clientSecret})}catch{throw new ApiError(400,"INVALID_VERCEL_ROOT")}
  try{return ok(await saveVercelRoot(root,actor))}catch(e){throw new ApiError(409,e instanceof Error&&/^[A-Z][A-Z0-9_]{1,80}$/.test(e.message)?e.message:"VERCEL_ROOT_UNVERIFIED")}
 }catch(e){return fail(e)}
}
