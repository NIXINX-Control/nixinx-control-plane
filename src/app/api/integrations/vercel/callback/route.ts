import {NextRequest} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {parseCallback} from "@/lib/vercel-integration-policy";
import {finishVercelAuthorization} from "@/lib/vercel-integration-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Set-Cookie":"nx_vercel_state=; Path=/api/integrations/vercel/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0"};
export async function GET(req:NextRequest){
 try{
  const input=parseCallback(req.nextUrl.searchParams);
  const cookie=req.cookies.get("nx_vercel_state")?.value;
  if(!cookie||! /^[a-f0-9]{64}$/.test(cookie)||!timingSafeEqual(Buffer.from(cookie),Buffer.from(input.state)))throw new Error("VERCEL_STATE_MISMATCH");
  await finishVercelAuthorization(input);
  return new Response(null,{status:303,headers:{...headers,Location:input.next}});
 }catch{
  // Generic output: do not render upstream errors, code, state or secrets.
  return new Response("No se pudo verificar la autorización de Vercel. Regresa a https://controlde.nixinx.org/ y revisa Provider Connections antes de reintentar.",{status:400,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
 }
}
