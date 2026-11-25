import { isDeepStrictEqual } from "node:util";
import { NextRequest } from "next/server";
import { ApiError, db, fail, ok, superadminUser } from "@/lib/server";
import { readRuntimeCandidate } from "@/lib/client-runtime-config-preflight";
import { stagedInitiativesRelease } from "@/lib/staged-initiatives-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const tenantId = "HTL";
const appId = "initiatives";
const hostname = "htl.initiatives.nixinx.app";
const projectId = "hottacosleamingtonwebapp";
const status = "STAGED_INACTIVE";

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    if (process.env.VERCEL_ENV !== "production" || req.nextUrl.search !== "?tenantId=HTL")
      throw new ApiError(409,"INSTALLATION_SCOPE_INVALID");
    const body = await req.json().catch(() => null);
    if (!body || Object.keys(body).length !== 1 || typeof body.planId !== "string" || !/^[a-f0-9]{64}$/.test(body.planId))
      throw new ApiError(400,"INSTALLATION_PLAN_ID_INVALID");

    const intake = db.collection("clientProvisioning").doc(tenantId);
    const plans = intake.collection("installationPlans");
    const planRef = plans.doc(body.planId);
    const packageRef = planRef.collection("execution").doc("runtime");
    const [planSnapshot,intakeSnapshot] = await Promise.all([planRef.get(),intake.get()]);
    const p = planSnapshot.data(), draft = intakeSnapshot.data();
    if (!p || !draft || p.planId !== body.planId || p.version !== 2 || p.tenantId !== tenantId ||
        p.appId !== appId || p.hostname !== hostname || p.accessMode !== "individual" ||
        p.applyAuthorized !== false || p.status !== "PENDING_APPLY_REVIEW" ||
        draft.tenantId !== tenantId || draft.appId !== appId || draft.googleBinding?.projectId !== projectId ||
        !p.releaseTarget || draft.requirements?.deploymentId !== p.releaseTarget.previousDeploymentId ||
        draft.requirements?.sourceCommit !== p.releaseTarget.registeredCommit)
      throw new ApiError(409,"INSTALLATION_PLAN_CHANGED");

    const [config, release] = await Promise.all([
      readRuntimeCandidate({tenantId,appId,hostname,binding:draft.googleBinding,requirements:draft.requirements.derivedFirebaseKeys},
        req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV),
      stagedInitiativesRelease(p.releaseTarget.registeredCommit,p.releaseTarget.previousDeploymentId)
    ]);
    if (config.status !== "VERIFY" || config.configDigest !== p.configDigest ||
        release.sourceCommit !== p.sourceCommit || release.sourceCommit !== p.releaseTarget.sourceCommit ||
        release.deploymentId !== p.releaseTarget.deploymentId)
      throw new ApiError(409,"INSTALLATION_PROVIDER_EVIDENCE_CHANGED");

    const record = {planId:p.planId,tenantId,appId,hostname,status,accessMode:"individual",
      sourceCommit:p.sourceCommit,deploymentId:release.deploymentId,configDigest:p.configDigest,
      firebase:config.candidate.firebase};
    const matches = (data: FirebaseFirestore.DocumentData | undefined) =>
      !!data && Object.entries(record).every(([key,value]) => isDeepStrictEqual(data[key],value));
    await db.runTransaction(async tx => {
      const latest = await tx.get(plans.orderBy("createdAt","desc").limit(1));
      const [current,source,owner,tenant,app,liveInstall,liveConfig,prior] = await tx.getAll(
        planRef,intake,db.collection("firebaseProjectOwners").doc(projectId),db.collection("tenants").doc(tenantId),
        db.collection("apps").doc(appId),db.collection("appInstallations").doc(hostname),
        db.collection("configurations").doc(hostname),packageRef);
      if (latest.docs[0]?.id !== p.planId || !current.updateTime?.isEqual(planSnapshot.updateTime!) ||
          !source.updateTime?.isEqual(intakeSnapshot.updateTime!) || owner.get("tenantId") !== tenantId ||
          owner.get("projectId") !== projectId || tenant.get("status") !== "active" || app.get("status") !== "active" ||
          app.get("provisioning.sourceCommit") !== p.releaseTarget.registeredCommit ||
          app.get("provisioning.deploymentId") !== p.releaseTarget.previousDeploymentId || liveInstall.exists || liveConfig.exists)
        throw new ApiError(409,"INSTALLATION_STATE_CHANGED");
      if (prior.exists) {
        if (!matches(prior.data())) throw new ApiError(409,"INSTALLATION_PACKAGE_CONFLICT");
        return;
      }
      const createdAt = new Date().toISOString();
      tx.create(packageRef,{...record,createdAt,createdBy:actor});
      tx.create(db.collection("audit").doc(),{actor,action:"STAGE_INSTALLATION_RUNTIME",tenantId,target:p.planId,at:createdAt});
    });
    const saved = (await packageRef.get()).data();
    if (!matches(saved)) throw new ApiError(503,"INSTALLATION_PACKAGE_READBACK_FAILED");
    return ok({planId:p.planId,status,createdAt:saved!.createdAt});
  } catch(error) { return fail(error); }
}
