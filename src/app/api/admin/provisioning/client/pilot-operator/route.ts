import { NextRequest } from "next/server";
import { ApiError, db, fail, ok, superadminUser } from "@/lib/server";

export const runtime = "nodejs";
const tenantId = "HTL";
const appId = "initiatives";
const status = "PENDING_FIREBASE_MEMBERSHIP";

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    if (process.env.VERCEL_ENV !== "production" || req.nextUrl.search !== "?tenantId=HTL")
      throw new ApiError(409,"PILOT_SCOPE_INVALID");
    const input = await req.json().catch(() => null);
    if (!input || Object.keys(input).sort().join(",") !== "email,planId" ||
        typeof input.planId !== "string" || !/^[a-f0-9]{64}$/.test(input.planId) ||
        typeof input.email !== "string") throw new ApiError(400,"PILOT_INPUT_INVALID");
    const email = input.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ApiError(400,"PILOT_EMAIL_INVALID");
    const plans = db.collection("clientProvisioning").doc(tenantId).collection("installationPlans");
    const plan = plans.doc(input.planId);
    const execution = plan.collection("execution");
    const pilot = execution.doc("pilotOperator");
    await db.runTransaction(async tx => {
      const latest = await tx.get(plans.orderBy("createdAt","desc").limit(1));
      const [p,stage,prior] = await tx.getAll(plan,execution.doc("runtime"),pilot);
      if (latest.docs[0]?.id !== plan.id || p.get("tenantId") !== tenantId || p.get("appId") !== appId ||
          p.get("accessMode") !== "individual" || stage.get("planId") !== plan.id || stage.get("status") !== "STAGED_INACTIVE" ||
          stage.get("firebase.projectId") !== "hottacosleamingtonwebapp") throw new ApiError(409,"PILOT_PLAN_CHANGED");
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
