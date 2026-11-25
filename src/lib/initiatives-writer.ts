import "server-only";

const project = "hottacosleamingtonwebapp";
const uid = "G7OuMNB6vlQrzbhq0gavMJeWOu12";
const email = "initiatives-writer@htl.nixinx.invalid";
const document = "https://firestore.googleapis.com/v1/projects/" + project +
  "/databases/(default)/documents/nixinx_entitlements/initiatives";
let session: { token: string; until: number } | undefined;

async function writerToken(apiKey: string) {
  if (session && session.until > Date.now()) return session.token;
  const password = process.env.NIXINX_HTL_INITIATIVES_WRITER_PASSWORD;
  if (!password) throw Error("WRITER_NOT_ENROLLED");
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(apiKey), {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4500),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!response.ok) throw Error("WRITER_AUTH_UNAVAILABLE");
  const data = await response.json();
  if (data.localId !== uid || typeof data.idToken !== "string" || Number(data.expiresIn) < 120) {
    throw Error("WRITER_IDENTITY_INVALID");
  }
  session = { token: data.idToken, until: Date.now() + Math.min(300, Number(data.expiresIn) - 60) * 1000 };
  return session.token;
}

export async function projectInitiativesDecision(
  apiKey: string, allowed: boolean, decidedAt: Date, validUntil: Date,
) {
  if (process.env.VERCEL_ENV !== "production") throw Error("WRITER_PRODUCTION_ONLY");
  const token = await writerToken(apiKey);
  const response = await fetch(document, {
    method: "PATCH", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4500),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: {
      clientId: { stringValue: "HTL" }, applicationId: { stringValue: "initiatives" },
      firebaseProjectId: { stringValue: project }, accessAllowed: { booleanValue: allowed },
      decidedAt: { timestampValue: decidedAt.toISOString() }, validUntil: { timestampValue: validUntil.toISOString() },
    } }),
  });
  if (!response.ok) {
    if (response.status === 401) session = undefined;
    throw Error("WRITER_PROJECTION_REJECTED");
  }
}
