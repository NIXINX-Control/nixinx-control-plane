export const managedOwner="nixinx-commercial-sandbox-v1";
export function refundablePayment(intent:any,charge:any,customer:any){
 if(intent?.livemode!==false||charge?.livemode!==false||customer?.livemode!==false||customer.deleted||customer.metadata?.nixinx_owner!==managedOwner||!(/^[a-f0-9]{64}$/.test(customer.metadata?.nixinx_uid_hash??""))||intent.customer!==customer.id||charge.customer!==customer.id||charge.payment_intent!==intent.id||intent.latest_charge!==charge.id||intent.status!=="succeeded"||charge.paid!==true||charge.captured!==true||charge.disputed!==false||intent.currency!=="cad"||charge.currency!=="cad"||!Number.isSafeInteger(charge.amount_captured)||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0||charge.amount_captured<charge.amount_refunded)throw Error("PAYMENT_NOT_ELIGIBLE");
 return charge.amount_captured-charge.amount_refunded;
}
export function validRefundAmount(value:unknown,available:number):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>0&&value<=available;}

/** Parse positive CAD input directly into integer cents, including .17.
 * Keep the server's nine-digit cents limit and reject excess precision.
 */
export function parseRefundBaseCents(value:string):number|null{
 if(typeof value!=="string"||!/^(?:\d{1,8}(?:\.\d{1,2})?|\.\d{1,2})$/.test(value))return null;
 const [whole="",fraction=""]=value.split(".");
 const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>0&&cents<=999999999?cents:null;
}
