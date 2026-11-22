// Role resolution is based on Firebase Auth UIDs, never on email suffixes.
// An unset privileged allowlist denies Advanced access by default.
export type NixinxStaffRole = "admin" | "superadmin";

function uidSet(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(value => value.trim()).filter(Boolean));
}

export function resolveStaffRole(
  uid: string,
  adminUids: string | undefined,
  superadminUids: string | undefined
): NixinxStaffRole | null {
  if (!uid.trim()) return null;
  if (uidSet(superadminUids).has(uid)) return "superadmin";
  if (uidSet(adminUids).has(uid)) return "admin";
  return null;
}
