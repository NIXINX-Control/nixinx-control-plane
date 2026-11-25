import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
for(const name of ["client-provisioning","product-provisioning"]){
 test(name+" uses the approved field styles for all labels",()=>{
  const src=fs.readFileSync(new URL("../src/components/"+name+".tsx",import.meta.url),"utf8");
  const labels=[...src.matchAll(/<label\b[^>]*>/g)].map(m=>m[0]);
  assert.ok(labels.length>=3);
  assert.ok(labels.every(l=>/className="field(?: |")/.test(l)));
  assert.ok(src.includes('className="stack"'));
 });
}
