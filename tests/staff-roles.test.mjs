import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source=fs.readFileSync(new URL("../src/lib/staff-roles.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {resolveStaffRole,canManageAdvanced,canGrantPaymentExemption}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));

test("missing privileged allowlist does not prevent authorized admins from using Advanced",()=>{
  assert.equal(resolveStaffRole("admin-uid","admin-uid",undefined),"admin");
  assert.equal(resolveStaffRole("unknown-uid",undefined,undefined),null);
  assert.equal(canManageAdvanced("admin"),true);
});

test("UID-only role resolution and no domain-based grants",()=>{
  assert.equal(resolveStaffRole("super-uid","admin-uid","super-uid"),"superadmin");
  assert.equal(resolveStaffRole("admin-uid","admin-uid","super-uid"),"admin");
  assert.equal(resolveStaffRole("outsider","admin-uid","super-uid"),null);
  assert.equal(resolveStaffRole("admin@nixinx.com","uid-a","uid-b"),null);
  assert.equal(resolveStaffRole(" uid-a ","uid-a","uid-b"),null);
});

test("superadmin role takes precedence if UID is in both allowlists",()=>{
  assert.equal(resolveStaffRole("super-uid","admin-uid,super-uid","super-uid"),"superadmin");
});

test("both NIXINX staff roles can manage Advanced, clients cannot",()=>{
  assert.equal(canManageAdvanced("admin"),true);
  assert.equal(canManageAdvanced("superadmin"),true);
  assert.equal(canManageAdvanced(null),false);
});

test("only superadmin can grant commercial payment exceptions",()=>{
  assert.equal(canGrantPaymentExemption("admin"),false);
  assert.equal(canGrantPaymentExemption("superadmin"),true);
  assert.equal(canGrantPaymentExemption(null),false);
});
