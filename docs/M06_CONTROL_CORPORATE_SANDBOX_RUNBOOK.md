# M06 — Aislamiento Firebase Control / Corporate para pruebas (2026-11-22)

**Autoridad:** FDV `NIXINX_APPS_CONTROL_CORPORATE_PILOT_20261122.md`. **Estado:** scripts y reglas preparados, recursos reales de GCP **NO creados por el asistente** (sin conexión de administración GCP). Se prohíben cambios a `nixinx-control`, `nelcy-corporate-group`, CTY/HTL/HTW y Production.

## Entornos

| Entorno | Proyecto propuesto, NO existente verificado | Propietario GCP | Datos |
|---|---|---|---|
| Control sandbox | `nixinx-control-sbx-26` | NIXINX, carpeta Development and Testing `410789317555` | Solo entidades sintéticas |
| Corporate sandbox | `nixinx-corporate-sbx-26` | Misma carpeta NIXINX | Solo movimientos sintéticos |
| Control operativo | `nixinx-control` | NIXINX / Control | CTY, HTL, HTW existentes: **NO TOCAR** |
| Corporate Nelcy | `nelcy-corporate-group` | Cliente existente | Datos reales: **NO TOCAR** |

Los dos IDs son **propuestas de nombre** y solo serán reales si el operador corre el script en Cloud Shell y este confirma creación. Son recursos de prueba con datos sintéticos propiedad de NIXINX, **no** una migración de datos de clientes.

## Paso 1 — Preflight Cloud Shell

Requisitos: `gcloud`, Firebase CLI (`firebase`), usuario activo `admin@nixinx.com` o `superadmin@nixinx.com` y acceso autorizado a NIXINX Corporation/Development and Testing.

```bash
gh repo clone NIXINX-Control/nixinx-control-plane -- --branch feat/control-corporate-service-entitlements-v05
cd nixinx-control-plane
bash scripts/bootstrap-corporate-sandbox.sh --preflight
```

El preflight es **solo lectura**, comprueba identidad, parentesco real de carpetas, formato y existencia de proyectos. Si ya existe algún proyecto o falla la lectura, **STOP**; no adoptar/proseguir por intuición.

## Paso 2 — Creación solo si el propietario aprueba costo y nombres

```bash
bash scripts/bootstrap-corporate-sandbox.sh --apply
```

Requiere escribir confirmación exacta. Crea **dos** proyectos nuevos bajo `Development and Testing`, añade Firebase, crea Firestore `(default)` en `northamerica-northeast2` y registra una Web App cada uno. **No** configura billing, IAM, contraseñas, OAuth, autorizaciones Firebase, variables Vercel o reglas de producción. Si la organización exige billing o una política lo impide, el script se detiene y preserva el estado parcial para reconciliar; **nunca reejecutar ciegamente**.

Firebase CLI oficial: `firebase projects:addfirebase --project PROJECT_ID` para añadir Firebase a GCP existente; GCloud `gcloud firestore databases create --database='(default)' --location=northamerica-northeast2 --type=firestore-native --project=PROJECT_ID`. La ubicación de Firestore es irreversible para esa base.

## Paso 3 — Configuración de ambas apps sin secretos en repos

1. Firebase Console **Control sandbox**: Google Auth habilitado, añadir **solo el dominio exacto** del Control Preview que se asocie a V05; sus administradores obtendrán UIDs **distintos** de la instancia `nixinx-control`. Preparar Firebase Web SDK config pública para ese mismo sandbox.
2. Firebase Console **Corporate sandbox**: Google Auth habilitado si los flujos Corporate lo requieren. Crear el usuario y membership **sintéticos** con autorización administrativa; no exportar/importar usuarios reales Nelcy.
3. Inicializar las reglas de sandbox: `firestore.rules` de Control deny-all para cliente web y **`firestore.preview.rules` de Corporate**, cuya configuración separada es `firebase.preview.json`. **No** usar `firebase.json` normal ni ejecutar reglas de sandbox sobre producción. Antes de publicar reglas, pruebas con Firebase Emulator (script de CI V06 actual cubre solo estructura, **no sustituye emulator E2E**).
4. Vercel `nixinx-control` Preview rama `feat/control-corporate-service-entitlements-v05`: configurar `NEXT_PUBLIC_FIREBASE_*` al Control sandbox; `FIREBASE_PROJECT_ID` y credencial server-only del **mismo proyecto**, `NIXINX_ADMIN_UIDS` y `NIXINX_SUPERADMIN_UIDS` según UIDs del sandbox, `NIXINX_CONTROL_CORPORATE_SERVICE_TOKEN` secreto fuerte y `NIXINX_CONTROL_CORPORATE_TENANT_ID` único tenant sintético. **No** dejar variables Preview generales que hereden el Firebase real.
5. Vercel `corporate` Preview rama `feat/corporate-control-gate-v01`: Firebase Web SDK config exclusiva del Corporate sandbox, `NEXT_PUBLIC_ORG_ID` sintético, `NIXINX_PREVIEW_FIREBASE_PROJECT_ID` idéntico a su project ID, `NIXINX_CONTROL_API_URL` HTTPS al Control **V05** Preview, `NIXINX_CONTROL_SERVICE_TOKEN` al mismo secreto de servidor, `NIXINX_CONTROL_TENANT_ID` tenant sandbox, `NIXINX_CORPORATE_HOSTNAME=nelcy-preview.corporate.nixinx.app`.
6. Ningún token o llave se registra en FDV, repositorio, logs, screenshots o variables `NEXT_PUBLIC_`. Preferir identidad federada/credencial de backend con privilegios mínimos; **no generar ni copiar SA keys sin diseño y autorización específica**.

Vercel devuelve 403 al listar envs mediante el conector actual; por tanto las variables de ambos Preview **no se consideran configuradas ni verificadas**. La configuración es una tarea del operador autorizado.

## Paso 4 — Seguridad data-plane y límites presentes

En Corporate el SSR consulta Control y bloquea la aplicación ante fallo. La nueva `firestore.preview.rules` requiere también que:
- UID esté asignado explícitamente como miembro de la organización sintética;
- exista `organizations/{orgId}/nixinxControl/access` mantenido **solo** por backend administrativo, con `active=true`, `appId=corporate`, `environment=preview` y `expiresAt > request.time`;
- ningún usuario cliente pueda leer ni modificar la autorización de Control.

El **espejo de entitlement** necesita una sincronización backend confiable aún por implementar. Hasta disponer de ella **ningún miembro tendrá acceso Firestore**, aunque el SSR se autorice; eso es deliberado (fail-closed). El lease temporal deberá ser de duración corta y respaldado por revocación; no basta copiar manualmente `active=true` ni escribirlo desde el browser. La auditoría y la defensa de accesos directos requieren pruebas con el emulador y dos tenants sintéticos antes de considerar la revocación E2E.

## Pruebas positivas/negativas requeridas

- UID visitante o Google recién registrado sin membership → rechazo de datos.
- Miembro autorizado sin lease / lease vencido / lease desactivado → rechazo de lectura y escritura.
- Miembro autorizado con lease vigente creado por backend y licencia activa en Control → acceso únicamente a su org.
- Cambio a otro tenant/app/hostname o URL Vercel alterna → rechazo.
- Licencia suspendida/expirada y Control inaccesible → SSR rechaza; Firestore rechaza al expirar/revocar lease.
- Revocación y reactivación sin eliminar datos sintéticos, logs sin motivo comercial hacia el cliente.
- Probar IAM y roles del Admin SDK; esas credenciales eluden las reglas cliente y deben autorizarse en servidor.

**STOP:** Hasta que existan Firebase aislados, variables correctas, lease bridge y pruebas negativas, no hay E2E positivo ni autorización para Production. Las reglas productivas `firestore.rules` permanecen inalteradas.

## M06-B — Puente backend para el lease (implementación, aún sin entorno autorizado)

La rama V05 ahora implementa `src/lib/corporate-preview-lease.ts`, respaldado por el contrato puro `corporate-lease-contract.ts` y tests. Tras una petición M2M autenticada, Control comprueba el vínculo exacto `appInstallations/{hostname}` (tenant, aplicación Corporate, dominio, Preview), licencia/estado/módulo, y si hay `sandboxOrgId` configurado intenta escribir **directamente en Firestore de Corporate sandbox** el documento `organizations/{sandboxOrgId}/nixinxControl/access`. Solo un backend con credencial IAM autorizada puede hacerlo.

- **Permiso:** `allowed=true` → `active=true`, `expiresAt` 30 segundos posterior al instante del servidor; denegación con vínculo válido → `active=false` y lease expirado.
- **Fail-closed:** no responde `allowed=true` si falla la escritura de Firestore sandbox, falta `sandboxOrgId`, proyecto sandbox no coincide o las credenciales no autorizan la operación. Si una instalación deja de existir o Control cae sin recibir petición, cualquier lease previo expira por sí solo en un máximo de 30 segundos.
- **Destino restringido:** únicamente IDs con formato `nixinx-corporate-sbx-...`, la organización interna exacta `NIXINX_CONTROL_CORPORATE_SANDBOX_ORG_ID` y una instalación que coincida con el `tenantId` del token. En Control Preview configurar `NIXINX_CONTROL_CORPORATE_SANDBOX_PROJECT_ID` y `NIXINX_CONTROL_CORPORATE_SANDBOX_ORG_ID` (sin secretos públicos); en la instalación agregar `sandboxOrgId` correspondiente a `NEXT_PUBLIC_ORG_ID` de Corporate sandbox.
- **Credencial:** `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` del **Control sandbox**, con autorización limitada y explícita a Firestore del **Corporate sandbox**. Preferir identidad federada cuando se diseñe; no usar el SA de Control o Corporate de producción. Las credenciales, IAM y billing aún NO están configurados o verificados.
- **Límite:** el contrato se renueva **solo cuando Corporate consulta Control en el backend**. Una sesión abierta sin nuevas consultas caducará a los 30 segundos, aunque siga licenciada. El heartbeat seguro/autenticado y la revocación proactiva al pulsar Suspender siguen pendientes; no se debe presentar como comportamiento productivo completo.
- **CI:** tests de política de lease (proyecto sandbox, org exacta, duración, denegación) y tests estructurales de `firestore.preview.rules`. **No equivalen** a pruebas Firebase Emulator ni E2E con GCP.

**No desplegar a producción, no cambiar reglas originales de Nelcy, no crear IAM de larga duración por comodidad.**
