import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../src/components/commercial-refunds.tsx",import.meta.url),"utf8");
test("commercial billing UI offers no pilot execution or preflight transport",()=>{
 assert.doesNotMatch(source,/native-execute|native-preflight|executeSandboxCredit|Validar autorización \(sin emitir\)|Emitir nota de crédito y reembolsar|method:\s*["']POST/);
 assert.match(source,/method:"GET"/);
});
test("operator can still look up payments, estimate credit and recover historical operations",()=>{
 for(const label of ["Buscar facturas pagadas","Actualizar saldo","Calcular devolución con impuestos","Consultar y conciliar","Consultar pago","Consultar desglose histórico"])assert.ok(source.includes(label),label);
 for(const query of ["fiscalBase:","creditPreview:","?requestId=","?paymentIntentId="])assert.ok(source.includes(query),query);
 assert.match(source,/no se emiten nuevas devoluciones/i);
});
