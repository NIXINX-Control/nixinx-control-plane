import { NextRequest } from "next/server";
import { ApiError, db, fail, ok, superadminUser } from "@/lib/server";
import { discoverProduct } from "@/lib/product-discovery-provider";
import { getProviderToken, providerTeam } from "@/lib/provider-connections";
import { appModuleDocId } from "@/lib/catalog";

export const runtime = "nodejs";
const appId = "initiatives";
const tenantId = "HTL";
const hostname = "htl.initiatives.nixinx.app";
const repository = "NIXINX-Software/initiatives-portal";
const vercelProjectId = "prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV";

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    if (process.env.VERCEL_ENV !== "production" || req.nextUrl.search !== "?tenantId=HTL")
      throw new ApiError(409, "MODULE_SCOPE_INVALID");
    const body = await req.json().catch(() => null);
    if (!body || Object.keys(body).length !== 1 || typeof body.planId !== "string" || !/^[0-9a-f]{64}$/.test(body.planId))
      throw new ApiError(400, "PLAN_ID_INVALID");
    const product = await discoverProduct({appId, repository, vercelProjectId});
    const declared = product.manifest.modules.find(m => m.id === appId);
    if (!declared || product.manifest.requirements?.accessModes.join(",") !== "individual")
      throw new ApiError(409, "INDIVIDUAL_MODULE_UNVERIFIED");
    const token = await getProviderToken("vercel");
    const response = await fetch("https://api.vercel.com/v13/deployments/" + hostname + "?teamId=" + encodeURIComponent(providerTeam()), {
      headers:{Authorization:"Bearer " + token}, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new ApiError(409, "HOSTNAME_DEPLOYMENT_UNAVAILABLE");
    const d = await response.json();
    if (d.projectId !== vercelProjectId || d.target !== "production" || d.readyState !== "READY" ||
        (d.gitSource?.sha ?? d.meta?.githubCommitSha) !== product.sourceCommit || !/^dpl_[A-Za-z0-9]+$/.test(d.id))
      throw new ApiError(409, "HOSTNAME_RELEASE_MISMATCH");
    const plans = db.collection("clientProvisioning").doc(tenantId).collection("installationPlans");
    const plan = plans.doc(body.planId);
    const mod = db.collection("appModules").doc(appModuleDocId(appId, appId));
    await db.runTransaction(async tx => {
      const latest = await tx.get(plans.orderBy("createdAt","desc").limit(1));
      const [saved, stage, app, catalog] = await tx.getAll(plan, plan.collection("execution").doc("runtime"), db.collection("apps").doc(appId), mod);
      if (latest.docs[0]?.id !== plan.id || saved.get("version") !== 2 ||
          saved.get("tenantId") !== tenantId || saved.get("appId") !== appId ||
          saved.get("releaseTarget.deploymentId") !== d.id || saved.get("sourceCommit") !== product.sourceCommit ||
          stage.get("planId") !== plan.id || stage.get("hostname") !== hostname || stage.get("status") !== "STAGED_INACTIVE" ||
          stage.get("deploymentId") !== d.id || app.get("status") !== "active" ||
          app.get("provisioning.repository") !== repository || app.get("provisioning.vercelProjectId") !== vercelProjectId ||
          catalog.get("appId") !== appId || catalog.get("moduleId") !== appId || catalog.get("name") !== declared.name)
        throw new ApiError(409, "CATALOG_PLAN_MISMATCH");
      if (catalog.get("verified") === true && catalog.get("status") === "active" && catalog.get("verifiedCommit") === product.sourceCommit) return;
      if (catalog.get("status") !== "draft" || catalog.get("verified") !== false)
        throw new ApiError(409, "MODULE_STATE_CHANGED");
      const at = new Date().toISOString();
      tx.update(mod, {status:"active", verified:true, verifiedCommit:product.sourceCommit, verifiedDeploymentId:d.id, updatedAt:at});
      tx.create(db.collection("audit").doc(), {actor, action:"VERIFY_DEPLOYED_MODULE", target:mod.id, tenantId, planId:plan.id, at});
    });
    return ok({moduleId:appId, verified:true});
  } catch (e) { return fail(e); }
}
