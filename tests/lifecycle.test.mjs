import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const source=fs.readFileSync(new URL("../src/lib/lifecycle.ts",import.meta.url),"utf8");
test("lifecycle implements fail-closed decisions and transition guard",()=>{assert.match(source,/LICENSE_MISSING/);assert.match(source,/SERVICE_DISABLED/);assert.match(source,/MODULE_NOT_LICENSED/);assert.match(source,/EXPIRED/);assert.match(source,/terminated:\[\]/)});
