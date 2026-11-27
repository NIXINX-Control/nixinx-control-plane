import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/commercial-refund-policy.ts",import.meta.url),"utf8");
const {refundablePayment,validRefundAmount,parseRefundBaseCents}=await import("data:text/javascript;base64,"+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64"));
function fixture(){return [{id:"pi_test",customer:"cus_test",latest_charge:"ch_test",livemode:false,status:"succeeded",currency:"cad"},{id:"ch_test",customer:"cus_test",payment_intent:"pi_test",livemode:false,paid:true,captured:true,disputed:false,currency:"cad",amount_captured:57,amount_refunded:10},{id:"cus_test",livemode:false,metadata:{nixinx_owner:"nixinx-commercial-sandbox-v1",nixinx_uid_hash:"a".repeat(64)}}];}
test("only remaining captured cents can be refunded",()=>{assert.equal(refundablePayment(...fixture()),47);for(const n of [0,-1,48,1.5,"47",NaN])assert.equal(validRefundAmount(n,47),false);assert.equal(validRefundAmount(47,47),true);assert.equal(validRefundAmount(1,47),true);});
test("reject live resources, foreign customer, disputes and inconsistent payment linkage",()=>{for(const [index,key,value] of [[0,"livemode",true],[1,"livemode",true],[2,"livemode",true],[0,"customer","cus_other"],[1,"payment_intent","pi_other"],[1,"disputed",true],[1,"captured",false],[1,"amount_refunded",58],[2,"metadata",{}],[0,"currency","usd"]]){const f=fixture();f[index][key]=value;assert.throws(()=>refundablePayment(...f),/PAYMENT_NOT_ELIGIBLE/);}});

test("refund base accepts decimal without leading zero and converts exact cents",()=>{
 for(const [raw,expected] of [[".17",17],["0.17",17],[".1",10],["0.01",1],[".01",1],["1",100],["1.2",120],["12.34",1234],["9999999.99",999999999]])assert.equal(parseRefundBaseCents(raw),expected,raw);
});
test("refund base rejects invalid or unsupported amounts without rounding",()=>{
 for(const raw of ["",".","0","0.00",".00","-0.17","+0.17","0.171",".171","1e2","1,17"," 0.17 ","1.2.3","10000000","NaN","Infinity"])assert.equal(parseRefundBaseCents(raw),null,raw);
});
