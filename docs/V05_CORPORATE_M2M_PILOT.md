# NIXINX Control V05 — Corporate service-to-service licensing pilot

**2026-11-22 · Estado:** PR Draft, preview-only, fail-closed, sin datos clientes ni aprobación de despliegue productivo. Base: V04 y FDV 22-Nov.

## Endpoint servidor

`POST /api/internal/entitlements` acepta **exclusivamente** una llamada del backend de Corporate con `Authorization: Bearer <secreto-servidor>`. No es endpoint para navegadores, usuarios Google, ni clientes. El token se verifica con hash SHA256 y comparación de tiempo constante. Carga JSON `tenantId,appId="corporate",hostname,environment="preview"`, y opcionalmente `moduleId`/`siteId`.

Para conceder `allowed=true` se requiere todo lo siguiente:
- `NIXINX_CONTROL_CORPORATE_SERVICE_TOKEN` configurado como secreto de 32+ caracteres en backend Control Preview y mismo token en backend Corporate Preview.
- `NIXINX_CONTROL_CORPORATE_TENANT_ID` configurado en Control Preview, único tenant permitido para esta credencial. El endpoint rechaza Production.
- `appInstallations/{hostname}` con tenant, app, host y entorno exactos, `status=active`, `verified=true`.
- `tenants/{tenantId}` y `apps/corporate` activos.
- `licenses/{tenantId}_corporate` existente con estado/vigencia/módulo autorizado mediante `accessDecision`; la versión actual todavía no tiene alcance por establecimiento real.
- Error de credencial, timeout, licencia ausente, instalación no verificada, host alternativo o suspensión = **no acceso**.

Respuesta mínima `{allowed:boolean,referenceCode:"NX-XXXXXXXXXX"}`, sin detalles comerciales; motivos solo en logs del servidor Control con el mismo código. Las credenciales no se devuelven, registran ni publican. No se ejecuta mutación Firestore ni se activan excepciones comerciales.

## Inscripción del piloto (pendiente, no ejecutar sobre clientes reales)

1. Proyecto Firebase de pruebas de **Control** segregado, y de **Corporate** segregado de `nelcy-corporate-group`. Preview Vercel por rama y variables separadas. No reutilizar registros HTL/HTW/CTY para pruebas.
2. Crear en un ambiente aislado `tenants/nelcy` y `apps/corporate`, licencia `nelcy_corporate` (sin módulos aún) y asignación `appInstallations/nelcy-preview.corporate.nixinx.app` solo tras comprobar dominio/tenant/Firebase/credenciales. Se necesita UI/API admin para gestionar instalaciones, no permitir autoconceder `verified`.
3. Test de otorgar acceso, expiración, suspensión, callback inalcanzable, host alternativo, otro tenant, módulos falsos, API directa y Firestore directo.
4. Implementar revocación efectiva a nivel Firestore/backend del cliente **antes de exponer datos**; un guard SSR por sí solo no bloquea SDK Firebase usado fuera de la app.

## Limitaciones

V05 resuelve el contrato inicial M2M y denial-by-default, **no** la publicación comercial, el portal de pagos, el aislamiento por establecimiento, ni el bloqueo definitivo de todos los caminos hacia Firestore. Corporate sigue con SDK cliente directo. Los `appModules` V04 no se activan hasta validación del manifiesto versionado de repositorio.

Referencia: [piloto Corporate](https://github.com/NIXINX-Managed/nelcy_corporate_group/blob/feat/corporate-control-gate-v01/docs/NIXINX_CONTROL_CORPORATE_PILOT_V01.md).

## Control V05 — Puente sandbox de autorización temporal (añadido)

Se incorpora `src/lib/corporate-preview-lease.ts`: la API M2M verifica licencia e instalación y sincroniza un documento Firestore de **Corporate sandbox** desde el servidor de Control. Permite a `firestore.preview.rules` exigir a cada lectura/escritura un lease activo no vencido, junto a membresía. 30 s máximo; denegación invalida el lease. Sin proyecto `nixinx-corporate-sbx-...`, `sandboxOrgId` autorizado y permisos IAM del servicio **deniega** y no expone datos.

Aún faltan GCP sandbox real, IAM y variables Vercel Preview, enrolamiento, reglas desplegadas, Emulator/E2E y mecanismo seguro de renovación continua de lease. **No** se ha ejecutado GCP ni configurado tokens. Hasta esos gates, el estado sigue NO E2E.
