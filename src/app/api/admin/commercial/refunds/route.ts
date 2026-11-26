import {NextRequest} from "next/server";
import {createHash,randomUUID} from "node:crypto";
import {nativeCreditForm,validateAllocatedCreditPreview} from "@/lib/commercial-credit-refund-policy";
import {staffIdentity,db,ok,fail,ApiError,str} from "@/lib/server";
import {refundablePayment,validRefundAmount} from "@/lib/commercial-refund-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function authorized(req:NextRequest){
 const staff=await staffIdentity(req);
 if(!staff.canEditPrice)throw new ApiError(403,"Commercial refunds require verified superadmin@nixinx.com");
 return staff.uid;
}
async function stripe(path:string,form?:URLSearchParams,key?:string){
 const secret=process.env.STRIPE_REFUNDS_SECRET_KEY;
 if(!secret?.startsWith("rk_test_"))throw new ApiError(503,"Sandbox refund key unavailable");
 const headers:Record<string,string>={Authorization:"Bearer "+secret,"Stripe-Version":"2024-06-20"};
 if(form)headers["Content-Type"]="application/x-www-form-urlencoded";
 if(key)headers["Idempotency-Key"]=key;
 const r=await fetch("https://api.stripe.com/v1/"+path,{method:form?"POST":"GET",headers,body:form,cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new ApiError(503,"Stripe operation requires reconciliation");
 const v=await r.json();
 // Stripe Refund objects have no livemode field. Only accept this exception on refund endpoints;
 // the restricted test key and independently verified test Charge/PaymentIntent are the mode evidence.
 const refundEndpoint=path==="refunds"||path.startsWith("refunds/")||path.startsWith("refunds?");
 const validMode=(item:any)=>item?.livemode===false||(refundEndpoint&&item?.object==="refund"&&item.livemode===undefined);
 if(v.object==="list"?(!Array.isArray(v.data)||v.data.some((item:any)=>!validMode(item))):!validMode(v))throw new ApiError(409,"Live operation rejected");return v;
}
function paymentId(v:unknown){if(typeof v!=="string"||!/^pi_[A-Za-z0-9]{8,100}$/.test(v))throw new ApiError(400,"Invalid payment reference");return v;}
async function review(id:string){
 const intent=await stripe("payment_intents/"+id);
 if(!/^ch_[A-Za-z0-9]+$/.test(intent.latest_charge??"")||!/^cus_[A-Za-z0-9]+$/.test(intent.customer??""))throw new ApiError(409,"Payment not eligible");
 const [charge,customer]=await Promise.all([stripe("charges/"+intent.latest_charge),stripe("customers/"+intent.customer)]);
 let available:number;try{available=refundablePayment(intent,charge,customer);}catch{throw new ApiError(409,"Payment not eligible");}
 return {paymentIntentId:id,customerId:customer.id,customerName:typeof customer.name==="string"?customer.name:null,chargeId:charge.id,currency:"cad",captured:charge.amount_captured,refunded:charge.amount_refunded,available};
}
function requestIdentifier(v:unknown){if(typeof v!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))throw new ApiError(400,"Invalid refund request reference");return v;}
async function reconcile(requestId:string){
 const ref=db.collection("audit").doc("commercial-refund-"+requestId);
 const snap=await ref.get(),record=snap.data();
 if(!record||record.action!=="COMMERCIAL_REFUND"||record.environment!=="sandbox")throw new ApiError(404,"Refund authorization not found");
 const id=paymentId(record.target),lock=db.collection("commercialRefundLocks").doc(id);
 const intent=await stripe("payment_intents/"+id);
 if(intent.id!==id||intent.customer!==record.customerId||intent.latest_charge!==record.chargeId||!/^ch_[A-Za-z0-9]+$/.test(record.chargeId))throw new ApiError(409,"Refund payment evidence mismatch");
 const charge=await stripe("charges/"+record.chargeId);
 if(charge.id!==record.chargeId||charge.payment_intent!==id||charge.customer!==record.customerId||charge.currency!=="cad"||intent.currency!=="cad")throw new ApiError(409,"Refund charge evidence mismatch");
 let refund:any;
 if(record.stripeRefundId){
  if(!/^re_[A-Za-z0-9]+$/.test(record.stripeRefundId))throw new ApiError(409,"Invalid stored refund reference");
  refund=await stripe("refunds/"+record.stripeRefundId);
 }else{
  const page=await stripe("refunds?"+new URLSearchParams({payment_intent:id,limit:"100"}));
  if(page.has_more)throw new ApiError(409,"Refund history requires manual reconciliation");
  const matches=page.data.filter((r:any)=>r.metadata?.nixinx_request_id===requestId);
  if(matches.length!==1)throw new ApiError(409,"No unique Stripe refund found. Authorization remains locked; do not create another request.");
  refund=matches[0];
 }
 if(!/^re_[A-Za-z0-9]+$/.test(refund.id??"")||refund.payment_intent!==id||refund.charge!==record.chargeId||refund.amount!==record.amount||refund.currency!=="cad"||refund.metadata?.nixinx_request_id!==requestId||refund.metadata?.nixinx_owner!=="nixinx-commercial-sandbox-v1"||!["succeeded","pending","requires_action","failed","canceled"].includes(refund.status))throw new ApiError(409,"Refund evidence mismatch");
 await db.runTransaction(async tx=>{
  const [current,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(current.get("fingerprint")!==record.fingerprint||(current.get("stripeRefundId")&&current.get("stripeRefundId")!==refund.id))throw new ApiError(409,"Refund audit conflict");
  if(active.exists&&active.get("requestId")!==requestId&&!["succeeded","failed","canceled"].includes(current.get("stripeStatus")))throw new ApiError(409,"Refund lock mismatch");
  tx.update(ref,{stripeRefundId:refund.id,stripeStatus:refund.status,status:"STRIPE_RECORDED",reconciledAt:new Date().toISOString()});
  if(active.exists&&active.get("requestId")===requestId&&["succeeded","failed","canceled"].includes(refund.status))tx.delete(lock);
 });
 return {id:refund.id,status:refund.status,amount:refund.amount,reconciled:true};
}
async function commercialLookup(req:NextRequest,acronym:string){
 if(!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(acronym))throw new ApiError(400,"Invalid commercial acronym");
 const response=await fetch("https://nixinx.com/api/customer-portal/financial-lookup",{method:"POST",headers:{Authorization:req.headers.get("authorization")||"","Content-Type":"application/json"},body:JSON.stringify({acronym}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new ApiError(503,"Commercial payment lookup unavailable");
 const data=await response.json();if(!Array.isArray(data.payments)||data.payments.length>100)throw new ApiError(503,"Invalid commercial payment lookup");
 return data;
}
async function boundPayment(req:NextRequest,acronym:string,id:string,p:Awaited<ReturnType<typeof review>>){
 const data=await commercialLookup(req,acronym);
 const matches=data.payments.filter((v:any)=>v.paymentIntentId===id);
 if(matches.length!==1)throw new ApiError(409,"Payment is not uniquely bound to a commercial order");
 const v=matches[0];
 if(!/^in_[A-Za-z0-9]+$/.test(v.invoiceId??"")||!/^sub_[A-Za-z0-9]+$/.test(v.subscriptionId??"")||typeof v.orderId!=="string"||!v.orderId||v.orderId.length>200||v.customerId!==p.customerId||v.amount!==p.captured||v.currency!=="cad")throw new ApiError(409,"Commercial invoice binding mismatch");
 return {acronym,invoiceId:v.invoiceId as string,orderId:v.orderId as string,subscriptionId:v.subscriptionId as string};
}
function invoiceLineEvidence(invoice:any){
 // Scope initial acceptance to one positive, undiscounted invoice line. Never invent a tax rate
 // or credit a generic adjustment. For multi-line/discounted invoices require explicit allocation.
 if(invoice.lines?.has_more!==false||!Array.isArray(invoice.lines.data)||invoice.lines.data.length!==1||!Array.isArray(invoice.total_discount_amounts)||invoice.total_discount_amounts.some((d:any)=>d.amount!==0)||invoice.shipping_cost)throw new ApiError(409,"Invoice requires line allocation review");
 const line=invoice.lines.data[0];
 if(!/^il_[A-Za-z0-9]+$/.test(line.id??"")||line.currency!=="cad"||!Number.isSafeInteger(line.amount)||line.amount<=0||!Array.isArray(line.tax_amounts)||line.tax_amounts.some((t:any)=>!Number.isSafeInteger(t.amount)||t.amount<0||t.inclusive!==false||typeof t.tax_rate!=="string")||!Array.isArray(line.discount_amounts)||line.discount_amounts.some((d:any)=>d.amount!==0))throw new ApiError(409,"Invoice line requires tax allocation review");
 const originalTax=line.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0);
 if(!Number.isSafeInteger(originalTax)||invoice.tax!==originalTax||invoice.total!==line.amount+originalTax||invoice.total!==invoice.amount_paid)throw new ApiError(409,"Original invoice tax evidence mismatch");

 return {line,originalTax};
}
async function prospectiveCredit(req:NextRequest,acronym:string,id:string,baseRaw:string){
 if(!/^\d{1,9}$/.test(baseRaw))throw new ApiError(400,"Importe base inválido");
 const base=Number(baseRaw),p=await review(id),binding=await boundPayment(req,acronym,id,p);
 const [invoice,notes]=await Promise.all([stripe("invoices/"+binding.invoiceId),stripe("credit_notes?"+new URLSearchParams({invoice:binding.invoiceId,limit:"100"}))]);
 if(invoice.object!=="invoice"||invoice.id!==binding.invoiceId||invoice.customer!==p.customerId||invoice.payment_intent!==id||invoice.subscription!==binding.subscriptionId||invoice.status!=="paid"||invoice.currency!=="cad"||invoice.amount_paid!==p.captured)throw new ApiError(409,"Invoice evidence mismatch");
 if(notes.has_more||notes.data.some((n:any)=>n.object!=="credit_note"||n.invoice!==invoice.id))throw new ApiError(409,"Credit note history requires reconciliation");
 const {line,originalTax}=invoiceLineEvidence(invoice);
 if(!Number.isSafeInteger(base)||base<=0||base>line.amount)throw new ApiError(400,"Importe base fuera de la línea facturada");
 const params=new URLSearchParams({invoice:invoice.id,"lines[0][type]":"invoice_line_item","lines[0][invoice_line_item]":line.id,"lines[0][amount]":String(base),email_type:"none"});
 const v=await stripe("credit_notes/preview?"+params);
 const tax=Array.isArray(v.tax_amounts)&&v.tax_amounts.every((t:any)=>Number.isSafeInteger(t.amount)&&t.amount>=0&&line.tax_amounts.some((original:any)=>original.tax_rate===t.tax_rate))?v.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0):null;
 if(v.object!=="credit_note"||v.invoice!==invoice.id||v.customer!==p.customerId||v.currency!=="cad"||v.type!=="post_payment"||v.lines?.has_more!==false||v.lines?.data?.length!==1||v.lines.data[0].type!=="invoice_line_item"||v.lines.data[0].invoice_line_item!==line.id||v.total_excluding_tax!==base||!Number.isSafeInteger(v.total)||v.total<base||tax===null||v.total-base!==tax)throw new ApiError(409,"Stripe fiscal preview integrity mismatch");
 // Historical refunds must be covered by issued credit notes before a new financial operation.
 const active=notes.data.filter((n:any)=>n.status==="issued"&&n.type==="post_payment");
 const credited=active.reduce((sum:number,n:any)=>sum+(Number.isSafeInteger(n.total)&&n.total>0?n.total:0),0);
 const blockers:string[]=[];
 if(p.refunded!==0||active.length!==0)blockers.push("Historial financiero requiere conciliación previa");
 if(!validRefundAmount(v.total,p.available))blockers.push("El total fiscal excede el saldo disponible");
 // For an eligible clean invoice, also preview Stripe's native refund allocation.
 // This is a GET only; no authorization, reservation, note or refund is created.
 let allocationVerified=false;
 if(blockers.length===0){
  const intent={invoiceId:binding.invoiceId,lineId:line.id,paymentIntentId:id,chargeId:p.chargeId,customerId:p.customerId,requestId:randomUUID(),subtotal:base,tax,amount:v.total,taxRateIds:Array.from(new Set<string>(line.tax_amounts.map((t:any)=>t.tax_rate)))};
  try{
   const allocated=await stripe("credit_notes/preview?"+nativeCreditForm(intent));
   validateAllocatedCreditPreview(allocated,intent);
   allocationVerified=true;
  }catch{blockers.push("Stripe no confirmó la asignación nativa del reembolso; no autorizar");}
 }
 return {invoiceNumber:invoice.number??null,originalSubtotal:line.amount,originalTax,originalTotal:invoice.total,subtotal:base,tax,total:v.total,available:p.available,refunded:p.refunded,credited,blockers,allocationVerified,mode:"fiscal_preview_only",issuanceEnabled:false};
}
async function creditPreview(req:NextRequest,requestId:string,acronym:string){
 const record=(await db.collection("audit").doc("commercial-refund-"+requestId).get()).data();
 if(!record||record.action!=="COMMERCIAL_REFUND"||record.environment!=="sandbox"||record.status!=="STRIPE_RECORDED"||record.stripeStatus!=="succeeded"||!/^re_[A-Za-z0-9]+$/.test(record.stripeRefundId??""))throw new ApiError(409,"Reconcile a successful existing refund first");
 const id=paymentId(record.target),p=await review(id),binding=await boundPayment(req,acronym,id,p);
 if(p.customerId!==record.customerId||p.chargeId!==record.chargeId||!Number.isSafeInteger(record.amount)||record.amount<=0||p.refunded<record.amount||(record.acronym&&record.acronym!==acronym)||(record.invoiceId&&record.invoiceId!==binding.invoiceId)||(record.orderId&&record.orderId!==binding.orderId)||(record.subscriptionId&&record.subscriptionId!==binding.subscriptionId))throw new ApiError(409,"Existing refund binding mismatch");
 const [invoice,refund,notes]=await Promise.all([stripe("invoices/"+binding.invoiceId),stripe("refunds/"+record.stripeRefundId),stripe("credit_notes?"+new URLSearchParams({invoice:binding.invoiceId,limit:"100"}))]);
 if(invoice.object!=="invoice"||invoice.id!==binding.invoiceId||invoice.customer!==p.customerId||invoice.payment_intent!==id||invoice.subscription!==binding.subscriptionId||invoice.status!=="paid"||invoice.currency!=="cad"||invoice.amount_paid!==p.captured)throw new ApiError(409,"Invoice evidence mismatch");
 if(refund.object!=="refund"||refund.id!==record.stripeRefundId||refund.payment_intent!==id||refund.charge!==p.chargeId||refund.status!=="succeeded"||refund.amount!==record.amount||refund.currency!=="cad"||refund.metadata?.nixinx_request_id!==requestId||refund.metadata?.nixinx_owner!=="nixinx-commercial-sandbox-v1")throw new ApiError(409,"Refund evidence mismatch");
 if(notes.has_more||notes.data.some((n:any)=>n.object!=="credit_note"||n.invoice!==invoice.id))throw new ApiError(409,"Credit note history requires reconciliation");
 const existing=notes.data.filter((n:any)=>n.refund===refund.id);
 if(existing.length)throw new ApiError(409,"Existing linked credit note requires reconciliation; do not issue another");
 const {line,originalTax}=invoiceLineEvidence(invoice);
 // Estimate line amount from the original invoice's actual monetary split. Stripe alone
 // determines the tax and final total; no local rate table, no adjustment or rounding fallback.
 const estimate=Math.round(refund.amount*line.amount/invoice.total);
 if(!Number.isSafeInteger(estimate)||estimate<=0||estimate>line.amount)throw new ApiError(409,"Refund requires line allocation review");
 async function previewLine(base:number,linked:boolean){
  const params=new URLSearchParams({invoice:invoice.id,"lines[0][type]":"invoice_line_item","lines[0][invoice_line_item]":line.id,"lines[0][amount]":String(base),email_type:"none"});
  if(linked)params.set("refund",refund.id);
  const v=await stripe("credit_notes/preview?"+params);
  const taxes=Array.isArray(v.tax_amounts)&&v.tax_amounts.every((t:any)=>Number.isSafeInteger(t.amount)&&t.amount>=0&&line.tax_amounts.some((original:any)=>original.tax_rate===t.tax_rate))?v.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0):null;
  const checks=[v.object==="credit_note"?"":"objeto",v.invoice===invoice.id?"":"factura",v.customer===invoice.customer?"":"cliente",v.currency==="cad"?"":"moneda",v.type==="post_payment"?"":"tipo",v.lines?.has_more===false&&v.lines?.data?.length===1&&v.lines.data[0].type==="invoice_line_item"&&v.lines.data[0].invoice_line_item===line.id?"":"línea",v.total_excluding_tax===base?"":"base",Number.isSafeInteger(v.total)&&v.total>=base?"":"total válido",taxes!==null&&taxes===v.total-base?"":"impuesto"].filter(Boolean);
  if(originalTax>0&&refund.amount>base&&taxes===0)checks.push("impuesto esperado");
  // A fiscal candidate has no allocation request. Stripe may represent the
  // unallocated total as out-of-band in its preview. Never accept that as a linked credit.
  if(linked){
   if(v.total!==refund.amount)checks.push("total reembolso");
   if(v.refund!==null&&v.refund!==refund.id)checks.push("referencia devolución");
   if((v.out_of_band_amount??0)!==0)checks.push("fuera de Stripe");
   if(v.customer_balance_transaction)checks.push("saldo cliente");
  }
  if(checks.length)throw new ApiError(409,"Stripe "+(linked?"vinculación":"cálculo fiscal")+" no conciliado (centavos CAD). Base "+base+", impuesto "+(taxes??"no disponible")+", total "+(Number.isSafeInteger(v.total)?v.total:"no disponible")+". Reembolso "+refund.amount+". Validaciones: "+checks.join(", ")+". Sin emisión.");
  return v;
 }
 // First determine the fiscal amount without asking Stripe to allocate a refund.
 // Only a matching fiscal candidate may be previewed with the existing refund.
 let candidate=await previewLine(estimate,false);
 if(candidate.total!==refund.amount){
  const next=estimate+(candidate.total>refund.amount?-1:1);
  if(next<=0||next>line.amount)throw new ApiError(409,"No hay base adyacente válida. Revisión fiscal requerida. Sin emisión.");
  const adjacent=await previewLine(next,false);
  if(adjacent.total!==refund.amount)throw new ApiError(409,"No se encontró una distribución exacta (centavos CAD). Stripe: base "+estimate+", impuesto "+(candidate.total-estimate)+", total "+candidate.total+"; base "+next+", impuesto "+(adjacent.total-next)+", total "+adjacent.total+". Reembolso: "+refund.amount+". Revisión fiscal requerida. Sin emisión.");
  candidate=adjacent;
 }
 const preview=await previewLine(candidate.total_excluding_tax,true);
 if(preview.total!==candidate.total||preview.total_excluding_tax!==candidate.total_excluding_tax||preview.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0)!==candidate.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0))throw new ApiError(409,"Stripe changed fiscal amounts during refund linkage. Sin emisión.");
 return {requestId,invoiceNumber:invoice.number??null,currency:"cad",amount:preview.total,subtotal:preview.total_excluding_tax,tax:preview.total-preview.total_excluding_tax,refundId:refund.id,originalSubtotal:line.amount,originalTax,originalTotal:invoice.total,mode:"preview_only"};
}
export async function GET(req:NextRequest){
 try{await authorized(req);if(req.nextUrl.searchParams.get("directory")==="1"){
 const cursor=req.nextUrl.searchParams.get("cursor");
 if(cursor!==null&&!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(cursor))throw new ApiError(400,"Invalid directory cursor");
 const response=await fetch("https://nixinx.com/api/customer-portal/financial-lookup",{method:"POST",headers:{Authorization:req.headers.get("authorization")||"","Content-Type":"application/json"},body:JSON.stringify({directory:true,...(cursor?{cursor}:{})}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new ApiError(503,"Directorio comercial no disponible");
 const data=await response.json();
 if(!Array.isArray(data.customers)||data.customers.length>100||data.customers.some((v:any)=>typeof v.acronym!=="string"||!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(v.acronym)||typeof v.company!=="string"||!v.company.trim()||v.company.length>150)||(data.cursor!==null&&(typeof data.cursor!=="string"||!data.customers.length||data.cursor!==data.customers.at(-1)?.acronym||data.cursor===cursor)))throw new ApiError(503,"Invalid commercial directory");
 return ok({customers:data.customers.map((v:any)=>({acronym:v.acronym,company:v.company})),cursor:data.cursor});
 }const fiscalBase=req.nextUrl.searchParams.get("fiscalBase");if(fiscalBase!==null)return ok(await prospectiveCredit(req,req.nextUrl.searchParams.get("acronym")??"",paymentId(req.nextUrl.searchParams.get("paymentIntentId")),fiscalBase));const creditRequest=req.nextUrl.searchParams.get("creditPreview");if(creditRequest!==null)return ok(await creditPreview(req,requestIdentifier(creditRequest),req.nextUrl.searchParams.get("acronym")??""));const acronym=req.nextUrl.searchParams.get("acronym");if(acronym!==null){
 return ok(await commercialLookup(req,acronym));
 }const requestId=req.nextUrl.searchParams.get("requestId");if(requestId)return ok(await reconcile(requestIdentifier(requestId)));return ok(await review(paymentId(req.nextUrl.searchParams.get("paymentIntentId"))));}catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 try{
 const actor=await authorized(req);const b=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
 if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["paymentIntentId","amount","reason","requestId","expectedRefunded","confirmed","acronym"].includes(k)))throw new ApiError(400,"Invalid refund request");
 const id=paymentId(b.paymentIntentId),reason=str(b.reason,500);
 if(b.confirmed!==true||typeof b.requestId!=="string"||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.requestId))||!Number.isSafeInteger(b.amount)||b.amount<=0||!Number.isSafeInteger(b.expectedRefunded)||b.expectedRefunded<0)throw new ApiError(400,"Invalid refund authorization");
 const fingerprint=createHash("sha256").update(JSON.stringify([actor,id,b.amount,reason,b.expectedRefunded])).digest("hex");
 const ref=db.collection("audit").doc("commercial-refund-"+b.requestId);
 const prior=await ref.get();
 if(prior.exists){
  if(prior.get("fingerprint")!==fingerprint)throw new ApiError(409,"Refund request conflict");
  if(prior.get("status")==="REJECTED_BEFORE_EXECUTION")throw new ApiError(409,"Authorization rejected before execution; review payment again");
  return ok(await reconcile(requestIdentifier(b.requestId)));
 }
 // New paid-invoice refunds must originate from a Stripe credit note. Preserve
 // legacy retry/reconciliation above, but do not create another uncredited refund.
 throw new ApiError(409,"Nuevos reembolsos requieren nota de crédito fiscal; emisión todavía no habilitada. Usa previsualización.");
 }catch(e){return fail(e);}
}
