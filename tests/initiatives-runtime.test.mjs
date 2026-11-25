import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  Function("require", "exports", compiled.outputText)(name => {
    if (!(name in dependencies)) throw Error("Unmapped dependency " + name);
    return dependencies[name];
  }, exports);
  return exports;
}

test("Initiatives requires an authenticated production workload, verified binding and licensed module", async () => {
  const hostname = "htl.initiatives.nixinx.app";
  const tenantId = "HTL";
  const appId = "initiatives";
  const projectId = "hottacosleamingtonwebapp";
  const firebase = { apiKey: "example-public-key", authDomain: "example.firebaseapp.com", projectId,
    storageBucket: "example.appspot.com", messagingSenderId: "123456", appId: "1:123456:web:abcdef" };
  const installation = { appId, tenantId, hostname, firebaseProjectId: projectId, status: "active",
    environment: "production", verified: true, accessMode: "individual", dataAuthorizationVerified: true };
  const license = { appId, tenantId, status: "active", validUntil: null, graceDays: 0, modules: ["initiatives"] };
  const records = {
    ["appInstallations/" + hostname]: installation,
    ["configurations/" + hostname]: { appId, tenantId, hostname, status: "active", firebase },
    "clientProvisioning/HTL": { appId, tenantId, googleBinding: { projectId, projectNumber: "123456", webAppId: firebase.appId } },
    "tenants/HTL": { status: "active" }, "apps/initiatives": { status: "active" },
    "licenses/HTL_initiatives": license, ["firebaseProjectOwners/" + projectId]: { projectId, tenantId },
  };
  const snap = id => ({data: () => records[id], readTime: {toDate: () => new Date()}});
  const writes = [];
  const route = load("app/api/internal/initiatives/runtime/route.ts", {
    "@/lib/initiatives-writer": { projectInitiativesDecision: async (...args) => { writes.push(args); } },
    jose: { createRemoteJWKSet: () => ({}), jwtVerify: async token => {
      if (token !== "valid") throw Error();
      return { payload: { owner_id: "team_7GCW65202sW0sdYEgH3LDeFE", project_id: "prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV" } };
    } },
    "@/lib/server": { db: { collection: c => ({ doc: id => c + "/" + id }),
      runTransaction: fn => fn({ getAll: (...ids) => ids.map(snap), get: snap }) } },
    "@/lib/lifecycle": load("lib/lifecycle.ts"),
    "@/lib/tenant-configuration": load("lib/tenant-configuration.ts"),
    "@/lib/client-google-binding": { restoreClientGoogleBinding: value => value },
  });
  const prior = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  const call = (host = hostname, token = "valid") => route.POST(new Request("https://example.test/", {
    method: "POST", headers: { Authorization: "Bearer " + token }, body: JSON.stringify({ hostname: host }),
  }));
  try {
    assert.equal((await call(hostname, "invalid")).status, 401);
    assert.equal((await call("htw.initiatives.nixinx.app")).status, 400);
    const ok = await (await call()).json();
    assert.equal(ok.allowed, true);
    assert.equal(writes.at(-1)[1], true);
    assert.ok(writes.at(-1)[3] - writes.at(-1)[2] <= 30000);
    assert.equal(ok.kpis, false);
    assert.deepEqual(ok.firebase, firebase);
    for (const [record, key, value] of [
      [installation, "dataAuthorizationVerified", false], [installation, "verified", false],
      [records["firebaseProjectOwners/" + projectId], "tenantId", "HTW"],
      [records["configurations/" + hostname], "status", "draft"], [license, "status", "suspended"],
      [license, "modules", ["kpis"]], [records["tenants/HTL"], "servicesTerminatedAt", "2026-01-01"],
    ]) {
      const original = record[key];
      record[key] = value;
      try {
        const denied = await call();
        assert.equal(denied.status, 403, key);
        if (record === license || key === "servicesTerminatedAt") assert.equal(writes.at(-1)[1], false);
        assert.deepEqual(await denied.json(), { allowed: false }, key);
      } finally { record[key] = original; }
    }
  } finally {
    if (prior === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prior;
  }
});
