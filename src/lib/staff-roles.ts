// Staff roles use verified Firebase Auth UIDs, never the email suffix.
// Missing allowlists deny access by default.
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

// Advanced is operational administration for both NIXINX staff roles.
export function canManageAdvanced(role: NixinxStaffRole | null): boolean {
  return role === "admin" || role === "superadmin";
}

// Only superadmin may approve a commercial payment exemption.
export function canGrantPaymentExemption(role: NixinxStaffRole | null): boolean {
  return role === "superadmin";
}

// Price authority requires both the UID allowlist role and the verified designated mailbox.
export function canEditCommercialPrice(role:NixinxStaffRole|null,email:unknown,verified:unknown):boolean{
 return role==="superadmin"&&verified===true&&email==="superadmin@nixinx.com";
}
