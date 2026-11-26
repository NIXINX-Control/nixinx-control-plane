import {db,adminUser,fail} from "@/lib/server";
import type {NextRequest} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
async function published(){
 const snapshot=await db.collection("apps").limit(501).get();
 if(snapshot.size>500)throw Error("CATALOG_LIMIT");
 return snapshot.docs.flatMap(doc=>{
  const app=doc.data();
  return app.status==="active"&&app.commercialPublished===true&&/^[a-z][a-z0-9-]{1,38}$/.test(doc.id)&&typeof app.name==="string"&&app.name.trim()
   ?[{id:doc.id,name:app.name.trim().slice(0,120)}]:[];
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function GET(){
 try{return Response.json({items:await published()},{headers});}
 catch{return Response.json({error:"CATALOG_UNAVAILABLE"},{status:503,headers});}
}
// Staff-authenticated read of the same published subset, for commercial reconciliation.
export async function POST(req:NextRequest){
 try{await adminUser(req);return Response.json({items:await published()},{headers});}
 catch(e){return fail(e);}
}
