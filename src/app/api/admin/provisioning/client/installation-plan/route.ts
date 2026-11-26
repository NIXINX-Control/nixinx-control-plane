import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { db, superadminUser, ok, fail, ApiError } from "@/lib/server";
import { stagedInitiativesRelease } from "@/lib/staged-initiatives-release";
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
    let target: {sourceCommit:string;deploymentId:string;previousDeploymentId:string;registeredCommit:string}|undefined;
    if (p.tenantId==="HTL" && p.appId==="initiatives" && p.hostname==="htl.initiatives.nixinx.app" &&
        p.providerEvidence?.reason==="REGISTERED_PRODUCTION_RELEASE_CHANGED_OR_NOT_READY" &&
        p.steps.every((s:{resource:string;status:string})=>s.resource==="release" || s.status!=="BLOCKED")) {
      const app = (await db.collection("apps").doc("initiatives").get()).data()?.provisioning;
      if (app?.sourceCommit!==p.sourceCommit || !app?.deploymentId) throw new ApiError(409,"STAGED_BASELINE_CHANGED");
      const stage=await stagedInitiativesRelease(p.sourceCommit,app.deploymentId);
      const base=app.manifest?.requirements;
      const same=(a:unknown,b:unknown)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
      if (!base || app.repository!==stage.repository || app.vercelProjectId!==stage.vercelProjectId ||
          base.hosting!==stage.requirements.hosting ||
          !same(base.dataPlane,stage.requirements.dataPlane) || !same(base.firebaseWebConfigKeys,stage.requirements.firebaseWebConfigKeys) ||
          !same(base.firestoreCollections,stage.requirements.firestoreCollections) || !same(base.conditionalResources,stage.requirements.conditionalResources))
        throw new ApiError(409,"STAGED_RESOURCE_CONTRACT_CHANGED");
      target={sourceCommit:stage.sourceCommit,deploymentId:stage.deploymentId,previousDeploymentId:stage.previousDeploymentId,registeredCommit:p.sourceCommit};
      p.providerEvidence={...stage.routing,releaseVerified:true};
      const i=p.steps.findIndex((s:{resource:string})=>s.resource==="release");
      p.steps[i]={resource:"release",status:"VERIFY",reason:"STAGED_PRODUCTION_RELEASE_VERIFIED",owner:"NIXINX",evidence:stage.sourceCommit};
      p.steps.splice(i+1,0,{resource:"dns",status:stage.routing.dns.status,reason:stage.routing.dns.reason,owner:"NIXINX",evidence:stage.routing.checkedAt});
    }
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
    const spec = {version:target ? 2 : 1,...(target?{releaseTarget:target}:{}), tenantId:p.tenantId, appId:p.appId, hostname:p.hostname,
      sourceCommit:target?.sourceCommit ?? p.sourceCommit, configDigest:digest, accessMode:"individual",
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
    return ok({...p, ...(target?{sourceCommit:target.sourceCommit,releaseTarget:target}:{}), durablePlan:{planId,created,status:saved.status,createdAt:saved.createdAt,version:spec.version,accessMode:spec.accessMode}});
  } catch (error) { return fail(error); }
}

export async function GET(req: NextRequest) {
  try {
    await superadminUser(req);
    if (process.env.VERCEL_ENV !== "production") throw new ApiError(409,"INSTALLATION_PLAN_SCOPE_INVALID");
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const requestedApp = req.nextUrl.searchParams.get("appId");
    if (!tenantId || !/^[A-Za-z0-9_-]{2,80}$/.test(tenantId)) throw new ApiError(400,"TENANT_ID_INVALID");
    const intake = db.collection("clientProvisioning").doc(tenantId);
    const client = await intake.get();
    if (!client.exists || client.get("tenantId") !== tenantId ||
        (requestedApp !== null && client.get("appId") !== requestedApp)) return ok({durablePlan:null});
    const snapshot = await intake.collection("installationPlans").orderBy("createdAt","desc").limit(1).get();
    const latest = snapshot.docs[0]?.data();
    if (latest && (latest.tenantId !== tenantId || latest.appId !== client.get("appId"))) return ok({durablePlan:null});
    const execution = latest?.version === 2 ? (await snapshot.docs[0].ref.collection("execution").doc("runtime").get()).data() : undefined;
    const pilot = execution ? (await snapshot.docs[0].ref.collection("execution").doc("pilotOperator").get()).data() : undefined;
    return ok({durablePlan:latest ? {planId:latest.planId,status:latest.status,createdAt:latest.createdAt,version:latest.version,accessMode:latest.accessMode,pilotEmail:pilot?.email??null,pilotStatus:pilot?.status??null,stagedAt:execution?.status==="STAGED_INACTIVE" ? execution.createdAt : null} : null});
  } catch (error) { return fail(error); }
}
