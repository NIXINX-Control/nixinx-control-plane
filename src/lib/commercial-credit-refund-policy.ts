// Stripe is the fiscal authority. All monetary values are integer CAD cents.
export type NativeCreditIntent={invoiceId:string;lineId:string;paymentIntentId:string;chargeId:string;customerId:string;requestId:string;subtotal:number;tax:number;amount:number;taxRateIds:string[]};
const id=(v:unknown,prefix:string):v is string=>typeof v==="string"&&v.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(v);
const cents=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
function ensure(condition:unknown,message:string):asserts condition{if(!condition)throw Error(message);}
export function validateNativeCreditIntent(x:NativeCreditIntent){
 ensure(id(x.invoiceId,"in_")&&id(x.lineId,"il_")&&id(x.paymentIntentId,"pi_")&&id(x.chargeId,"ch_")&&id(x.customerId,"cus_"),"Invalid credit identity");
 ensure(typeof x.requestId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x.requestId),"Invalid credit request");
 ensure(cents(x.subtotal)&&x.subtotal>0&&cents(x.tax)&&cents(x.amount)&&x.amount>0&&x.subtotal+x.tax===x.amount,"Invalid approved fiscal split");
 ensure(Array.isArray(x.taxRateIds)&&x.taxRateIds.every(v=>id(v,"txr_"))&&new Set(x.taxRateIds).size===x.taxRateIds.length,"Invalid original tax references");
}
export function nativeCreditForm(x:NativeCreditIntent){
 validateNativeCreditIntent(x);
 // Never combine refund_amount with an existing refund or customer balance credit.
 return new URLSearchParams({invoice:x.invoiceId,"lines[0][type]":"invoice_line_item","lines[0][invoice_line_item]":x.lineId,"lines[0][amount]":String(x.subtotal),refund_amount:String(x.amount),email_type:"none","metadata[nixinx_request_id]":x.requestId,"metadata[nixinx_owner]":"nixinx-commercial-sandbox-v1"});
}
function fiscalEvidence(note:any,x:NativeCreditIntent){
 validateNativeCreditIntent(x);
 ensure(note?.object==="credit_note"&&note.livemode===false&&note.invoice===x.invoiceId&&note.customer===x.customerId&&note.currency==="cad"&&note.type==="post_payment","Credit identity mismatch");
 ensure(note.total===x.amount&&note.total_excluding_tax===x.subtotal,"Credit fiscal total mismatch");
 ensure(note.lines?.has_more===false&&Array.isArray(note.lines.data)&&note.lines.data.length===1&&note.lines.data[0].type==="invoice_line_item"&&note.lines.data[0].invoice_line_item===x.lineId,"Credit line mismatch");
 ensure(Array.isArray(note.tax_amounts)&&note.tax_amounts.every((t:any)=>cents(t.amount)&&x.taxRateIds.includes(t.tax_rate))&&note.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0)===x.tax,"Credit tax mismatch");
 ensure((note.out_of_band_amount??0)===0&&note.customer_balance_transaction===null,"Unexpected credit allocation");
}
export function validateAllocatedCreditPreview(note:any,x:NativeCreditIntent){
 fiscalEvidence(note,x);
 // Preview must never claim an existing refund. Actual issuance is separately authorized.
 ensure(note.refund===null,"Unexpected preview refund reference");
}
export function validateIssuedCredit(note:any,refund:any,x:NativeCreditIntent){
 fiscalEvidence(note,x);
 ensure(id(note.id,"cn_")&&note.status==="issued"&&note.metadata?.nixinx_request_id===x.requestId&&note.metadata?.nixinx_owner==="nixinx-commercial-sandbox-v1","Credit issuance evidence mismatch");
 ensure(id(note.refund,"re_")&&refund?.object==="refund"&&refund.id===note.refund&&refund.payment_intent===x.paymentIntentId&&refund.charge===x.chargeId&&refund.amount===x.amount&&refund.currency==="cad"&&(refund.livemode===undefined||refund.livemode===false),"Credit refund evidence mismatch");
 ensure(["succeeded","pending","requires_action","failed","canceled"].includes(refund.status),"Unknown refund status");
 return {creditNoteId:note.id,refundId:refund.id,status:refund.status,amount:x.amount};
}
