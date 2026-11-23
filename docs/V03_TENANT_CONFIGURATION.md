# V03 — Configuraciones por cliente y aplicación (primer incremento)
Authority: [FDV NIXINX BT / architecture 2026-11-21](https://github.com/NIXINX-Business-Transformation/nixinx-dwh/blob/main/docs/architecture/NIXINX_SOFTWARE_CONTROL_VERCEL_ARCHITECTURE_20261121.md).
Base: f439e1d1008b483f75634101642422b11faee010. Branch feat/tenant-configurations-v03. No production authorization.
- Reuse existing tenants, apps, licenses, audit and admin UID authentication. Add configurations/{hostname}; canonical hostname = tenantId.appId.nixinx.app. DNS labels lowercase; general app domain is not a tenant.
- Only public Firebase web SDK fields and optional public orgId, no Admin SDK credentials, passwords, service tokens or data. Validate syntax and sender/app consistency. Metadata is not evidence of ownership, permissions or actual connectivity; verify with client before activation.
- Admin-only GET/POST, Firestore transaction verifies client/app existence and active tenant, unique hostname document and immutable client/application/project binding. Draft only; edits audited without configuration values. Existing Firestore client rules remain deny all. No public configuration endpoint. UI supports list (up to 200, explicit truncation), create and edit drafts; no automatic population. Existing licensing and billing are unchanged, except datetime-local field serialization fixed for existing license creation.
- Synthetic unit tests exercise validation and binding. CI build and tests must pass before preview. Separate synthetic Firebase Control project/credentials for preview and two independent synthetic client projects before live integration. Do not use Nelcy data or register actual credentials for a test. Current Vercel Hobby is not for commercial operation.
- Next gates: verify NIXINX Control Firebase/Auth/UID and preview deployment; integrate read-only Vercel reconciliation; design audited activation and scoped service-to-service identity, no-store runtime lookup tied to verified app and exact host, license fail-closed, backend revocation including direct Firebase access; test isolation and rollback in Corporate preview then adapt Initiatives/Supply. No deletion or writes in customer Firebase, no domain mutation, no deploy to production on this change. General product domain must never default to Nelcy.

- Transactional `firebaseProjectOwners/{projectId}` claim prevents two legal tenants from registering the same Firebase project. One tenant may reuse its own project across apps. Reservation is not independently verified cloud ownership; no release or reassignment path in V03.

## V03 — Versión inicial de prueba de acceso (22-Nov-2026)

**Preparado para Preview; no despliegue productivo.** Flujo real de la PWA:
- Login con correo/contraseña o Google (si el dominio exacto del Preview está autorizado en Firebase).
- Firebase autentica identidad, pero una cuenta creada automáticamente **no gana permisos**. Antes de pintar el panel, la PWA consulta `GET /api/admin` con Firebase ID token; solo UIDs configurados como personal NIXINX reciben datos. Sin sesión/UID autorizado, la UI presenta acceso denegado; errores de servidor/red bloquean el panel y permiten reintento. En cambio de sesión, se descartan resultados de cargas anteriores.
- `admin@nixinx.com` y `superadmin@nixinx.com` pueden administrar clientes/apps/licencias y Configurations (Firebase Web SDK **público**, registros draft). Superadmin **es el único rol** para futuras exenciones de pago; este PR aún no crea ni activa exenciones.
- Endpoints administrativos usan Auth verificada en servidor, no cookies/hostname o correos declarados. Respuestas protegidas llevan `Cache-Control: private, no-store`. Firestore client SDK deniega acceso directo (`firestore.rules` deny-all).
- No hay acceso de clientes, pagos, Stripe, gestión real de environment variables Vercel, SDK M2M, ni revocación externa. No se permiten altas de clientes productivos como datos de prueba.

### Gate manual antes de utilizar Preview
1. Comprobar que el deployment Vercel corresponde exactamente al HEAD del PR #2 y tiene estado READY; no confundir URL de Preview con Production.
2. Verificar **sin exponer valores** que Preview tenga la configuración Firebase Auth/Firestore de un entorno **de pruebas aislado** y `NIXINX_ADMIN_UIDS`/`NIXINX_SUPERADMIN_UIDS` con los UID reales de esa instancia Firebase Auth. Si Preview reutiliza Firebase productivo, bloquear operaciones de escritura y posponer pruebas de CRUD.
3. Probar tres sesiones: `admin` autorizado (panel+Advanced), `superadmin` autorizado (panel+Advanced; exenciones aún no implementadas), tercero Google recién creado/no autorizado (denegado, `/api/admin` y `/api/admin/configurations` devuelven HTTP 403).
4. Confirmar `GET /api/health` responde el servicio esperado; probar `GET /api/admin` sin token devuelve 401, con token inválido devuelve 401. Nunca publicar tokens/UIDs o variables reales en issues o capturas.
5. Solo con Firebase de pruebas y autorización explícita, crear tenant/app ficticios, registrar una configuración pública draft y comprobar auditoría/ausencia de cambios en Vercel/Firebase cliente.
6. Verificar cierre de sesión y nueva sesión sin mostrar datos del usuario anterior; intentar URL directa a otra empresa y comprobar aislamiento antes de integrar clientes.

**Nota:** Vercel Deployment Protection puede exigir sesión de miembro NIXINX para abrir el Preview. Google sign-in en dominio preview distinto de los Authorized domains de Firebase producirá `auth/unauthorized-domain`: no autorizar masivamente subdominios dinámicos ni desactivar la protección; habilitar solo el origen de prueba aprobado. Mientras tanto probar Email/Password si corresponde.
