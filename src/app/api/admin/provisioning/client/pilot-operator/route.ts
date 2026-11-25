import { NextRequest } from "next/server";
import { ApiError, db, fail, ok, superadminUser } from "@/lib/server";

import { restoreClientGoogleBinding } from "@/lib/client-google-binding";
import { canonicalHostname } from "@/lib/client-hostname-draft";

export const runtime = "nodejs";
const status = "PENDING_FIREBASE_MEMBERSHIP";

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const requestedApp = req.nextUrl.searchParams.get("appId");
    if (process.env.VERCEL_ENV !== "production" || !tenantId || !/^[A-Za-z0-9_-]{2,80}$/.test(tenantId))
      throw new ApiError(409,"PILOT_SCOPE_INVALID");
    const input = await req.json().catch(() => null);
    if (!input || Object.keys(input).sort().join(",") !== "email,planId" ||
        typeof input.planId !== "string" || !/^[a-f0-9]{64}$/.test(input.planId) ||
        typeof input.email !== "string") throw new ApiError(400,"PILOT_INPUT_INVALID");
    const email = input.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ApiError(400,"PILOT_EMAIL_INVALID");
    const intake = db.collection("clientProvisioning").doc(tenantId);
    const plans = intake.collection("installationPlans");
    const plan = plans.doc(input.planId);
    const execution = plan.collection("execution");
    const pilot = execution.doc("pilotOperator");
    await db.runTransaction(async tx => {
      const latest = await tx.get(plans.orderBy("createdAt","desc").limit(1));
      const [p,stage,prior,client] = await tx.getAll(plan,execution.doc("runtime"),pilot,intake);
      const appId = client.get("appId");
      if (typeof appId !== "string" || client.get("tenantId") !== tenantId || (requestedApp !== null && requestedApp !== appId))
        throw new ApiError(409,"PILOT_SCOPE_INVALID");
      const binding = restoreClientGoogleBinding(client.get("googleBinding"),tenantId,appId);
      const hostname = canonicalHostname(tenantId,appId);
      const owner = await tx.get(db.collection("firebaseProjectOwners").doc(binding.projectId));
      if (latest.docs[0]?.id !== plan.id || p.get("tenantId") !== tenantId || p.get("appId") !== appId ||
          p.get("accessMode") !== "individual" || stage.get("planId") !== plan.id || stage.get("status") !== "STAGED_INACTIVE" ||
          p.get("hostname") !== hostname || stage.get("hostname") !== hostname ||
          stage.get("tenantId") !== tenantId || stage.get("appId") !== appId || stage.get("accessMode") !== "individual" ||
          stage.get("firebase.projectId") !== binding.projectId || stage.get("firebase.appId") !== binding.webAppId ||
          owner.get("tenantId") !== tenantId || owner.get("projectId") !== binding.projectId) throw new ApiError(409,"PILOT_PLAN_CHANGED");
      if (prior.exists && prior.get("status") !== status) throw new ApiError(409,"PILOT_MEMBERSHIP_REVIEW_REQUIRED");
      if (prior.exists && prior.get("email") === email) return;
      const at = new Date().toISOString();
      tx.set(pilot,{tenantId,appId,planId:plan.id,email,role:"operator",status,updatedAt:at,updatedBy:actor});
      tx.create(db.collection("audit").doc(),{actor,action:"DEFINE_PILOT_OPERATOR",tenantId,appId,target:plan.id,
        previousEmail:prior.exists ? prior.get("email") : null,email,at});
    });
    const saved = (await pilot.get()).data();
    if (saved?.email !== email || saved?.status !== status) throw new ApiError(409,"PILOT_CHANGED_DURING_SAVE");
    return ok({pilotEmail:email,pilotStatus:status});
  } catch(e){return fail(e)}
}
