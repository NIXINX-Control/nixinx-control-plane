import { createRemoteJWKSet, jwtVerify } from "jose";
import { projectInitiativesDecision } from "@/lib/initiatives-writer";
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
      const snapshots = await tx.getAll(...refs);
      const [installation, config, intake, tenant, app, license] = snapshots.map(s => s.data());
      if (!installation || !config || !intake || !tenant || !app) return null;
      const now = snapshots[0].readTime.toDate();
      if (installation.hostname !== hostname || installation.appId !== appId ||
          installation.tenantId !== tenantId || installation.environment !== "production" ||
          installation.verified !== true || installation.status !== "active" ||
          installation.accessMode !== "individual" || installation.dataAuthorizationVerified !== true ||
          config.status !== "active" || config.hostname !== hostname || config.tenantId !== tenantId ||
          config.appId !== appId || intake.tenantId !== tenantId || intake.appId !== appId) return null;
      const binding = restoreClientGoogleBinding(intake.googleBinding, tenantId, appId);
      const { firebase } = parseConfiguration({ hostname, appId, tenantId: tenantId.toLowerCase(), firebase: config.firebase });
      if (installation.firebaseProjectId !== binding.projectId || firebase.projectId !== binding.projectId ||
          firebase.appId !== binding.webAppId || firebase.messagingSenderId !== binding.projectNumber) return null;
      const owner = (await tx.get(db.collection("firebaseProjectOwners").doc(binding.projectId))).data();
      if (owner?.tenantId !== tenantId || owner?.projectId !== binding.projectId) return null;
      if (binding.projectId !== "hottacosleamingtonwebapp") return null;
      const timeZone = tenantTimeZone(tenant.timeZone);
      function permits(at: Date, moduleId: string) {
        return tenant?.status === "active" && app?.status === "active" && !tenant.servicesTerminatedAt &&
          !suspensionEffective(tenant.servicesSuspensionAt, at) &&
          license?.tenantId === tenantId && license.appId === appId && Array.isArray(license.modules) &&
          ["active", "trial", "grace"].includes(license.status) &&
          accessDecision(license as License, at, moduleId, timeZone).allowed;
      }
      const allowed = permits(now, "initiatives");
      // Shorten the lease at a scheduled suspension or effective license expiry.
      let low = now.getTime(), high = low + 30000;
      if (allowed && !permits(new Date(high), "initiatives")) {
        while (high - low > 1) {
          const mid = low + Math.floor((high - low) / 2);
          if (permits(new Date(mid), "initiatives")) low = mid;
          else high = mid;
        }
      }
      const validUntil = allowed ? new Date(high) : now;
      return { allowed, firebase, now, validUntil, kpis: allowed && permits(now, "kpis") };
    }, { readOnly: true });
    if (!result) return reply(denied, 403);
    await projectInitiativesDecision(result.firebase.apiKey, result.allowed, result.now, result.validUntil);
    if (!result.allowed || result.validUntil.getTime() <= Date.now()) return reply(denied, 403);
    return reply({ allowed: true, hostname, tenantId, appId, firebase: result.firebase, kpis: result.kpis });
  } catch { return reply(denied, 503); }
}
