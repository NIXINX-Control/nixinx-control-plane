import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compiled=ts.transpileModule(fs.readFileSync(new URL("../src/lib/commercial-credit-refund-policy.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {nativeCreditForm,validateAllocatedCreditPreview,validateIssuedCredit}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const intent={invoiceId:"in_fixture",lineId:"il_fixture",paymentIntentId:"pi_fixture",chargeId:"ch_fixture",customerId:"cus_fixture",requestId:"11111111-1111-4111-8111-111111111111",subtotal:17,tax:2,amount:19,taxRateIds:["txr_fixture"]};
const preview={object:"credit_note",livemode:false,invoice:intent.invoiceId,customer:intent.customerId,currency:"cad",type:"post_payment",total:19,total_excluding_tax:17,lines:{has_more:false,data:[{type:"invoice_line_item",invoice_line_item:intent.lineId}]},tax_amounts:[{amount:2,tax_rate:"txr_fixture"}],out_of_band_amount:0,customer_balance_transaction:null,refund:null};
const issued={...preview,id:"cn_fixture",status:"issued",refund:"re_fixture",metadata:{nixinx_request_id:intent.requestId,nixinx_owner:"nixinx-commercial-sandbox-v1"}};
const refund={object:"refund",id:"re_fixture",payment_intent:intent.paymentIntentId,charge:intent.chargeId,amount:19,currency:"cad",status:"succeeded"};
test("native form uses only new Stripe refund allocation; preserves exact approved total",()=>{
 const form=nativeCreditForm(intent);assert.equal(form.get("refund_amount"),"19");assert.equal(form.get("lines[0][amount]"),"17");assert.equal(form.has("refund"),false);assert.equal(form.has("credit_amount"),false);assert.equal(form.has("out_of_band_amount"),false);
 assert.throws(()=>nativeCreditForm({...intent,amount:20}));assert.throws(()=>nativeCreditForm({...intent,tax:-1}));assert.throws(()=>nativeCreditForm({...intent,subtotal:0,amount:2}));
});
test("allocated preview fails closed for tax, total, identity, other allocation and existing refund",()=>{
 validateAllocatedCreditPreview(preview,intent);
 for(const changes of [{total:20},{total_excluding_tax:18},{livemode:true},{customer:"cus_other"},{currency:"usd"},{refund:"re_other"},{out_of_band_amount:1},{customer_balance_transaction:"cbtxn_other"},{tax_amounts:[{amount:2,tax_rate:"txr_other"}]},{lines:{has_more:true,data:[]}}])assert.throws(()=>validateAllocatedCreditPreview({...preview,...changes},intent));
});
test("native issued note independently binds refund to invoice charge and approved total",()=>{
 assert.equal(validateIssuedCredit(issued,refund,intent).status,"succeeded");
 assert.equal(validateIssuedCredit(issued,{...refund,status:"pending"},intent).status,"pending");
 for(const changes of [{id:"re_other"},{charge:"ch_other"},{amount:20},{livemode:true},{status:"unknown"}])assert.throws(()=>validateIssuedCredit(issued,{...refund,...changes},intent));
 assert.throws(()=>validateIssuedCredit({...issued,metadata:{}},refund,intent));assert.throws(()=>validateIssuedCredit({...issued,status:"void"},refund,intent));
});
