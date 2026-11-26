import {NextRequest} from "next/server";
import {FieldPath} from "firebase-admin/firestore";
import {staffIdentity,db,ok,fail,ApiError} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const pageSize=30,scanLimit=300;
function dateValue(v:string|null){if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new ApiError(400,"Invalid date");return v;}
export async function GET(req:NextRequest){
 try{
  const staff=await staffIdentity(req),p=req.nextUrl.searchParams;
  const search=(p.get("q")??"").trim().toLowerCase(),category=p.get("category")??"all",from=dateValue(p.get("from")),to=dateValue(p.get("to"));
  if(search.length>160||!["all","commercial","licenses","provisioning","catalog","other"].includes(category)||(from&&to&&from>to))throw new ApiError(400,"Invalid audit filter");
  const rawCursor=p.get("cursor");let cursor:{at:string;id:string}|null=null;
  if(rawCursor){try{if(rawCursor.length>1000)throw Error();cursor=JSON.parse(Buffer.from(rawCursor,"base64url").toString("utf8"));if(!cursor||typeof cursor.at!=="string"||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.id!=="string"||!cursor.id||cursor.id.includes("/")||cursor.id.length>200)throw Error();}catch{throw new ApiError(400,"Invalid cursor");}}
  let query=db.collection("audit").orderBy("at","desc").orderBy(FieldPath.documentId(),"desc");
  if(from)query=query.where("at",">=",from+"T00:00:00.000Z");
  if(to)query=query.where("at","<",new Date(Date.parse(to)+86400000).toISOString());
  if(cursor)query=query.startAfter(cursor.at,cursor.id);
  const snapshot=await query.limit(scanLimit+1).get();
  const items=[];let scanned=0,last:{at:string;id:string}|null=null;
  for(const doc of snapshot.docs.slice(0,scanLimit)){
   const data=doc.data();scanned++;
   if(typeof data.at!=="string"||!Number.isFinite(Date.parse(data.at)))throw new ApiError(409,"Audit timestamp requires review");
   last={at:data.at,id:doc.id};
   const action=typeof data.action==="string"?data.action:"",commercial=action.startsWith("COMMERCIAL_");
   const group=commercial?"commercial":/LICENSE/.test(action)?"licenses":/PROVISION|INSTALL|PROVIDER|WIF|FIREBASE|VERCEL|GITHUB|GOOGLE/.test(action)?"provisioning":/^(CREATE|UPDATE|ARCHIVE)_/.test(action)?"catalog":"other";
   if(category!=="all"&&group!==category)continue;
   // Do not expose financial details to staff outside designated financial authority.
   const row={id:doc.id,at:data.at,action,target:typeof data.target==="string"?data.target:"",actor:typeof data.actor==="string"?data.actor:"",reason:(!commercial||staff.canEditPrice)&&typeof data.reason==="string"?data.reason:"",status:(!commercial||staff.canEditPrice)&&typeof data.status==="string"?data.status:"",...(commercial&&staff.canEditPrice?{amount:Number.isSafeInteger(data.amount)?data.amount:null,currency:typeof data.currency==="string"?data.currency:null,stripeStatus:typeof data.stripeStatus==="string"?data.stripeStatus:null}: {})};
   if(search&&!Object.values(row).some(v=>String(v??"").toLowerCase().includes(search)))continue;
   items.push(row);if(items.length===pageSize)break;
  }
  const hasMore=scanned<snapshot.size;
  return ok({items,scanned,hasMore,cursor:hasMore&&last?Buffer.from(JSON.stringify(last)).toString("base64url"):null});
 }catch(e){return fail(e);}
}
