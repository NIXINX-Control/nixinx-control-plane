import {db} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(){
 try{
  // Commercial pilot: Corporate is the sole approved product. Never expose staff records.
  const snapshot=await db.collection("apps").doc("corporate").get();
  const app=snapshot.data();
  const items=app?.status==="active"&&typeof app.name==="string"&&app.name.trim()
   ?[{id:snapshot.id,name:app.name.trim().slice(0,120)}]:[];
  return Response.json({items},{headers});
 }catch{
  return Response.json({error:"CATALOG_UNAVAILABLE"},{status:503,headers});
 }
}
