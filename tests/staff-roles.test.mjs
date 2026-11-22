import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source=fs.readFileSync(new URL("../src/lib/staff-roles.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {resolveStaffRole}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));

test("Advanced is denied if superadmin UID configuration is absent",()=>{
  assert.equal(resolveStaffRole("super-uid","admin-uid,super-uid",undefined),"admin");
  assert.equal(resolveStaffRole("super-uid",undefined,undefined),null);
});

test("Only configured Firebase Auth UID may become superadmin",()=>{
  assert.equal(resolveStaffRole("super-uid","admin-uid","super-uid"),"superadmin");
  assert.equal(resolveStaffRole("admin-uid","admin-uid","super-uid"),"admin");
  assert.equal(resolveStaffRole("outsider", "admin-uid", "super-uid"),null);
});

test("Superadmin takes precedence if UID appears in both lists",()=>{
  assert.equal(resolveStaffRole("super-uid","admin-uid,super-uid","super-uid"),"superadmin");
});

test("UID match is exact, whitespace trimmed; email domain is irrelevant",()=>{
  assert.equal(resolveStaffRole(" uid-a ","uid-a","uid-b"),null);
  assert.equal(resolveStaffRole("uid-a","uid-a, admin@nixinx.com"," uid-b, uid-c "),"admin");
  assert.equal(resolveStaffRole("uid-b","uid-a"," uid-b, uid-c "),"superadmin");
  assert.equal(resolveStaffRole("admin@nixinx.com","uid-a","uid-b"),null);
});
