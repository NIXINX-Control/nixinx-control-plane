import { isDeepStrictEqual } from "node:util";
import { NextRequest } from "next/server";
import { ApiError, db, fail, ok, superadminUser } from "@/lib/server";
import { readRuntimeCandidate } from "@/lib/client-runtime-config-preflight";
import { verifyPinnedInstallationRelease } from "@/lib/staged-initiatives-release";
import { restoreClientGoogleBinding } from "@/lib/client-google-binding";
import { canonicalHostname } from "@/lib/client-hostname-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const status = "STAGED_INACTIVE";

export async function POST(req: NextRequest) {
  try {
    const actor = await superadminUser(req);
    const query = req.nextUrl.searchParams;
    const tenantId = query.get("tenantId");
    const requestedApp = query.get("appId");
    if (process.env.VERCEL_ENV !== "production" || !tenantId || !/^[A-Za-z0-9_-]{2,80}$/.test(tenantId) ||
        query.getAll("tenantId").length!==1 || query.getAll("appId").length>1 ||
        [...query.keys()].some(k=>k!=="tenantId"&&k!=="appId"))
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
    if (!p || !draft || draft.tenantId!==tenantId || typeof draft.appId!=="string" ||
        (requestedApp!==null && requestedApp!==draft.appId)) throw new ApiError(409,"INSTALLATION_SCOPE_INVALID");
    const appId = draft.appId;
    const hostname = canonicalHostname(tenantId,appId);
    const binding = restoreClientGoogleBinding(draft.googleBinding,tenantId,appId);
    const projectId = binding.projectId;
    if (p.planId !== body.planId || p.version !== 2 || p.tenantId !== tenantId ||
        p.appId !== appId || p.hostname !== hostname || p.accessMode !== "individual" ||
        p.applyAuthorized !== false || p.status !== "PENDING_APPLY_REVIEW" ||
        !p.releaseTarget || p.sourceCommit!==p.releaseTarget.sourceCommit ||
        typeof draft.requirements?.repository!=="string" || typeof draft.requirements?.vercelProjectId!=="string" || draft.requirements?.deploymentId !== p.releaseTarget.previousDeploymentId ||
        draft.requirements?.sourceCommit !== p.releaseTarget.registeredCommit)
      throw new ApiError(409,"INSTALLATION_PLAN_CHANGED");

    const [config, release] = await Promise.all([
      readRuntimeCandidate({tenantId,appId,hostname,binding:draft.googleBinding,requirements:draft.requirements.derivedFirebaseKeys},
        req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV),
      verifyPinnedInstallationRelease({appId,hostname,repository:draft.requirements.repository,
        vercelProjectId:draft.requirements.vercelProjectId,sourceCommit:p.sourceCommit,
        deploymentId:p.releaseTarget.deploymentId,registeredCommit:p.releaseTarget.registeredCommit,
        previousDeploymentId:p.releaseTarget.previousDeploymentId})
    ]);
    if (config.status !== "VERIFY" || config.configDigest !== p.configDigest ||
        config.candidate.firebase.projectId !== projectId || config.candidate.firebase.appId !== binding.webAppId ||
        config.candidate.firebase.messagingSenderId !== binding.projectNumber || release.hostname!==hostname ||
        release.sourceCommit !== p.sourceCommit || release.sourceCommit !== p.releaseTarget.sourceCommit ||
        release.deploymentId !== p.releaseTarget.deploymentId)
      throw new ApiError(409,"INSTALLATION_PROVIDER_EVIDENCE_CHANGED");

    const record = {planId:p.planId,tenantId,appId,hostname,status,accessMode:p.accessMode,
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
          owner.get("projectId") !== projectId || owner.get("projectNumber") !== binding.projectNumber ||
          tenant.get("status") !== "active" || app.get("status") !== "active" ||
          app.get("provisioning.repository") !== draft.requirements.repository ||
          app.get("provisioning.vercelProjectId") !== draft.requirements.vercelProjectId ||
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
