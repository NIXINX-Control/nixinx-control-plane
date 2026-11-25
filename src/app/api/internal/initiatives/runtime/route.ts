import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/lib/server";
import { accessDecision, suspensionEffective, tenantTimeZone, type License } from "@/lib/lifecycle";
import { parseConfiguration } from "@/lib/tenant-configuration";
import { restoreClientGoogleBinding } from "@/lib/client-google-binding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issuer = "https://oidc.vercel.com/nixinx-projects";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
const hostname = "htl.initiatives.nixinx.app";
const tenantId = "HTL";
const appId = "initiatives";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const denied = { allowed: false };
  if (process.env.VERCEL_ENV !== "production") return reply(denied, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(denied, 401);
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      issuer, audience: "https://vercel.com/nixinx-projects", algorithms: ["RS256"],
      subject: "owner:nixinx-projects:project:initiatives:environment:production",
      requiredClaims: ["exp", "iat", "owner_id", "project_id"],
    });
    if (payload.owner_id !== "team_7GCW65202sW0sdYEgH3LDeFE" ||
        payload.project_id !== "prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV") return reply(denied, 403);
  } catch { return reply(denied, 401); }
  const input = await request.json().catch(() => null);
  if (!input || input.hostname !== hostname || Object.keys(input).length !== 1) return reply(denied, 400);

  try {
    const result = await db.runTransaction(async tx => {
      const refs = [
        ["appInstallations", hostname], ["configurations", hostname], ["clientProvisioning", tenantId],
        ["tenants", tenantId], ["apps", appId], ["licenses", tenantId + "_" + appId],
      ].map(([collection, id]) => db.collection(collection).doc(id));
      const [installation, config, intake, tenant, app, license] =
        (await tx.getAll(...refs)).map(s => s.data());
      if (!installation || !config || !intake || !tenant || !app || !license) return denied;
      const now = new Date();
      if (tenant.status !== "active" || app.status !== "active" || tenant.servicesTerminatedAt ||
          suspensionEffective(tenant.servicesSuspensionAt, now)) return denied;
      if (installation.hostname !== hostname || installation.appId !== appId ||
          installation.tenantId !== tenantId || installation.environment !== "production" ||
          installation.verified !== true || installation.status !== "active" ||
          installation.accessMode !== "individual" || installation.dataAuthorizationVerified !== true ||
          config.status !== "active" || config.hostname !== hostname || config.tenantId !== tenantId ||
          config.appId !== appId || intake.tenantId !== tenantId || intake.appId !== appId) return denied;
      const binding = restoreClientGoogleBinding(intake.googleBinding, tenantId, appId);
      const { firebase } = parseConfiguration({ hostname, appId, tenantId: tenantId.toLowerCase(), firebase: config.firebase });
      if (installation.firebaseProjectId !== binding.projectId || firebase.projectId !== binding.projectId ||
          firebase.appId !== binding.webAppId || firebase.messagingSenderId !== binding.projectNumber) return denied;
      const owner = (await tx.get(db.collection("firebaseProjectOwners").doc(binding.projectId))).data();
      if (owner?.tenantId !== tenantId || owner?.projectId !== binding.projectId) return denied;
      if (license.tenantId !== tenantId || license.appId !== appId || !Array.isArray(license.modules) ||
          !["active", "trial", "grace"].includes(license.status)) return denied;
      const permits = (moduleId: string) => accessDecision(license as License, now, moduleId, tenantTimeZone(tenant.timeZone)).allowed;
      if (!permits("initiatives")) return denied;
      return { allowed: true, hostname, tenantId, appId, firebase, kpis: permits("kpis") };
    }, { readOnly: true });
    return reply(result, result.allowed ? 200 : 403);
  } catch { return reply(denied, 503); }
}
