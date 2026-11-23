import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/catalog.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {isNewCatalogId,appModuleDocId,normalizeSelectedModules,validateSelectedModules,acceptsCatalogStatus}=
  await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));

test("new IDs are lowercase, stable and domain-safe; existing uppercase IDs are not migrated",()=>{
  for(const id of ["initiatives","production-control","htl"]) assert.equal(isNewCatalogId(id),true);
  for(const id of ["Initiatives","HTL","app_test","foo.bar","x","", "a".repeat(40),"init-"]) assert.equal(isNewCatalogId(id),false);
});
test("module document identifier is unique across apps",()=>{
  assert.equal(appModuleDocId("initiatives","dashboard"),"initiatives.dashboard");
  assert.notEqual(appModuleDocId("supply","dashboard"),appModuleDocId("initiatives","dashboard"));
});
test("module selection rejects unknown, duplicated and invalid IDs",()=>{
  assert.deepEqual(normalizeSelectedModules(["dashboard","reportes"]),["dashboard","reportes"]);
  for(const list of [["dashboard","dashboard"],["Dashboard"],["inventairo?"],["not_valid"],[7],null]){
    assert.throws(()=>normalizeSelectedModules(list));
  }
  assert.throws(()=>normalizeSelectedModules(Array.from({length:101},(_,i)=>"module-"+i)));
});
test("licence modules must exist and be active in the selected application",()=>{
  validateSelectedModules(["dashboard"],"initiatives",[{appId:"initiatives",moduleId:"dashboard",status:"active",verified:true}]);
  assert.throws(()=>validateSelectedModules(["dashboard"],"supply",[{appId:"initiatives",moduleId:"dashboard",status:"active",verified:true}]));
  assert.throws(()=>validateSelectedModules(["dashboard"],"initiatives",[{appId:"initiatives",moduleId:"dashboard",status:"retired",verified:true}]));
  assert.throws(()=>validateSelectedModules(["typo"],"initiatives",[undefined]));
  assert.throws(()=>validateSelectedModules(["dashboard"],"initiatives",[{appId:"initiatives",moduleId:"dashboard",status:"active",verified:false}]));
});
test("catalog supports logical retirement without physical deletions",()=>{
  assert.equal(acceptsCatalogStatus("modules","draft"),true);
  assert.equal(acceptsCatalogStatus("modules","retired"),true);
  assert.equal(acceptsCatalogStatus("apps","archived"),true);
  assert.equal(acceptsCatalogStatus("tenants","archived"),true);
  assert.equal(acceptsCatalogStatus("modules","archived"),false);
});
