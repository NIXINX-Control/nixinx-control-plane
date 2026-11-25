import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { db, superadminUser, ok, fail, ApiError } from "@/lib/server";
import { GET as preview } from "../plan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function scope(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "production" || req.nextUrl.search !== "?tenantId=HTL") {
    throw new ApiError(409, "INSTALLATION_PLAN_SCOPE_INVALID");
  }
  return db.collection("clientProvisioning").doc("HTL").collection("installationPlans");
}

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    const plans = scope(req);
    const response = await preview(req);
    if (!response.ok) return response;
    const p = await response.json();
    const digest = p.runtimeConfigEvidence?.configDigest;
    if (p.tenantId !== "HTL" || p.appId !== "initiatives" ||
        p.hostname !== "htl.initiatives.nixinx.app" || p.writes !== 0 ||
        p.applyAuthorized !== false || !/^[0-9a-f]{40}$/.test(p.sourceCommit ?? "") ||
        !/^[0-9a-f]{64}$/.test(digest ?? "") || !p.providerEvidence?.releaseVerified ||
        p.steps.some((s: {status: string}) => s.status === "BLOCKED") ||
        p.providerEvidence.reason !== "NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX" ||
        p.providerEvidence.dns?.reason !== "DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING" ||
        p.runtimeConfigEvidence.reason !== "RUNTIME_CONFIG_CANDIDATE_VALIDATED_PENDING_APPLY") {
      throw new ApiError(409, "INSTALLATION_PLAN_RECONCILIATION_REQUIRED");
    }
    const steps = p.steps.map((s: {resource:string;status:string;reason:string;owner:string}) =>
      ({resource:s.resource,status:s.status,reason:s.reason,owner:s.owner}));
    const spec = {version:1, tenantId:p.tenantId, appId:p.appId, hostname:p.hostname,
      sourceCommit:p.sourceCommit, configDigest:digest, accessMode:"individual",
      storageAndProcessingPayer:"client", steps, applyAuthorized:false};
    const planId = createHash("sha256").update(JSON.stringify(spec)).digest("hex");
    const ref = plans.doc(planId);
    const created = await db.runTransaction(async tx => {
      const found = await tx.get(ref);
      if (found.exists) return false;
      tx.create(ref, { ...spec, planId, status:"PENDING_APPLY_REVIEW", createdBy:actor,
        createdAt:new Date().toISOString(), dnsCheckedAt:p.providerEvidence.checkedAt,
        configCheckedAt:p.runtimeConfigEvidence.checkedAt });
      tx.create(db.collection("audit").doc(), {actor, action:"SAVE_INSTALLATION_PLAN",
        tenantId:"HTL", target:planId, at:new Date().toISOString()});
      return true;
    });
    const saved = (await ref.get()).data();
    if (saved?.planId !== planId || saved.applyAuthorized !== false) throw new ApiError(503,"INSTALLATION_PLAN_READBACK_FAILED");
    return ok({...p, durablePlan:{planId,created,status:saved.status,createdAt:saved.createdAt}});
  } catch (error) { return fail(error); }
}

export async function GET(req: NextRequest) {
  try {
    await superadminUser(req);
    const snapshot = await scope(req).orderBy("createdAt","desc").limit(1).get();
    const latest = snapshot.docs[0]?.data();
    return ok({durablePlan:latest ? {planId:latest.planId,status:latest.status,createdAt:latest.createdAt} : null});
  } catch (error) { return fail(error); }
}
