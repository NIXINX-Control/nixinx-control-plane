import {NextRequest} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {parseCallback,parsePrivateCallback} from "@/lib/vercel-integration-policy";
import {finishVercelAuthorization} from "@/lib/vercel-integration-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Set-Cookie":"nx_vercel_state=; Path=/api/integrations/vercel/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0"};
export async function GET(req:NextRequest){
 try{
  const cookie=req.cookies.get("nx_vercel_state")?.value;
  if(req.nextUrl.searchParams.get("source")==="marketplace"){
   if(!cookie||! /^[a-f0-9]{64}$/.test(cookie))throw new Error("VERCEL_STATE_MISMATCH");
   const input=parsePrivateCallback(req.nextUrl.searchParams);
   const receipt=Buffer.from(JSON.stringify({...input,state:cookie}),"utf8").toString("base64url");
   if(receipt.length>3800)throw new Error("VERCEL_CALLBACK_INVALID");
   // The dashboard does not echo external state. No exchange or binding on GET.
   // A superadmin POST from Control must confirm the same actor's one-use state.
   const out=new Headers(headers);
   out.append("Set-Cookie","nx_vercel_private_receipt="+receipt+"; Path=/api/admin/provisioning/connections/vercel; HttpOnly; Secure; SameSite=Strict; Max-Age=600");
   out.set("Location","https://controlde.nixinx.org/");
   return new Response(null,{status:303,headers:out});
  }
  const input=parseCallback(req.nextUrl.searchParams);
  if(!cookie||! /^[a-f0-9]{64}$/.test(cookie)||!timingSafeEqual(Buffer.from(cookie),Buffer.from(input.state)))throw new Error("VERCEL_STATE_MISMATCH");
  await finishVercelAuthorization(input);
  return new Response(null,{status:303,headers:{...headers,Location:input.next}});
 }catch{
  // Generic output: do not render upstream errors, code, state or secrets.
  return new Response("No se pudo verificar la autorización de Vercel. Regresa a https://controlde.nixinx.org/ y revisa Provider Connections antes de reintentar.",{status:400,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
 }
}
