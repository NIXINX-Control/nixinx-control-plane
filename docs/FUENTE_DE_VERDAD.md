# NIXINX Control — Fuente de Verdad
## Objetivo
Control plane independiente para clientes, aplicaciones, módulos, contratos, licencias, renovaciones, periodos de gracia, suspensión y auditoría. Mobile-first PWA, futuro Capacitor iOS/Android.
## Estado real
MVP inicial en rama feat/mobile-control-plane-mvp-20261114. Sin configuración productiva Firebase, Vercel ni procesador de pagos. No afirmar que las aplicaciones cliente ya están protegidas.
## Invariantes
- El cliente es dueño de sus datos; suspensión no elimina datos.
- Decisiones de licencia ejecutadas del lado servidor; denegar por defecto.
- Cambios administrativos exigen Firebase ID token y UID en NIXINX_ADMIN_UIDS.
- No exponer credenciales de servicio en navegador.
- Auditoría de creación y transición; ninguna edición directa de datos financieros.
- Ningún proceso automatizado de pago sin verificar firma de webhook, idempotencia, conciliación y fiscalidad.
- Integrar clientes sin romper módulos productivos.
## Pendiente priorizado
1. Test y build CI completo, correcciones de QA.
2. Autenticación y RBAC multirol con invitaciones; separar portal del cliente.
3. Modelo suscripción/contrato, máquina de estados y job idempotente de vigencias.
4. Contabilidad/billing provider, GST/HST y eventos de pago verificados.
5. Service-to-service authorization: tokens de aplicación con rotación, cachés de autorización cortas y revocación.
6. Integración piloto con Production Control; pruebas end-to-end de suspensión sin pérdida de datos.
7. Seguridad, retención/backup, App Store/Play Store con Capacitor.
## Regla obligatoria de acceso por autorización explícita — 2026-11-22

Google y Email/Password pueden crear una identidad de Firebase Authentication, pero **la creación de usuario, inicio de sesión o registro no autoriza acceso** a NIXINX Control ni a datos de ninguna empresa. Todo API administrativo se cierra por defecto para UID no autorizado; solo `NIXINX_ADMIN_UIDS` y `NIXINX_SUPERADMIN_UIDS` representan personal interno. Un usuario externo, aunque tenga ID token válido, debe recibir 403. El portal cliente futuro tendrá APIs separadas que exigirán membresía/rol activo explícito para su propio tenant y sede, nunca autoprovisionamiento de derechos.

La base Firestore de Control tiene reglas cliente `deny all`; esa capa **no** protege automáticamente otras PWAs ni backends que usen Firebase Admin SDK. Cada app cliente necesitará autorización por tenant/sede/módulo/acción y reglas/controles backend, con pruebas negativas de sesión anónima, cuenta Google recién creada, otro tenant, permisos revocados, rutas API directas y URLs alternativas. Un módulo intencionalmente público por QR solo permitirá funciones específicas aprobadas con sesión limitada, nunca acceso general a los datos.

## Seguridad administrativa V03 (rama/PR, sin producción)
- **Ambos roles** `admin` y `superadmin` pueden leer y editar `/api/admin/configurations` (Advanced); cada request verifica Firebase ID token y UID contra la allowlist de personal NIXINX. Los clientes no tienen acceso.
- **Solo `superadmin` podrá conceder excepciones/exenciones de pago**, delimitadas por cliente, producto/servicio, fechas, justificación y auditoría. Este endpoint aún no existe y no se habilita por cambiar Configurations.
- La UI de Configurations se muestra cuando la respuesta autenticada del servidor es `viewerRole=admin` o `viewerRole=superadmin`. Las peticiones API administrativas siempre validan la identidad en servidor, no el email visible.
- Deben configurarse los UIDs reales de `admin@nixinx.com` en `NIXINX_ADMIN_UIDS` y de `superadmin@nixinx.com` en `NIXINX_SUPERADMIN_UIDS` (en entorno seguro). Advanced funciona con cualquiera de esos roles; sin UID autorizado se deniega. Las excepciones de pago se bloquearán por defecto sin superadmin.
- No existe aún rol separado de soporte ni portal cliente. El backend solo admite los UIDs internos autorizados; la futura API M2M y portal del cliente serán superficies independientes.
- V03 solo registra Firebase web config pública en estado draft. No se crean pagos, permisos Firebase cliente, dominios ni despliegues en este PR.

## Continuidad
Antes de tocar código leer este documento, README y estado real de GitHub. Trabajar en rama, probar, PR. Nunca afirmar deploy o conexión de producción sin evidencia.

## V03 — nuevo incremento (rama, no producción)
Consultar [contrato global](https://github.com/NIXINX-Business-Transformation/nixinx-dwh/blob/main/docs/architecture/NIXINX_SOFTWARE_CONTROL_VERCEL_ARCHITECTURE_20261121.md) y [V03](V03_TENANT_CONFIGURATION.md). Catálogo borrador de configuración por cliente/app; no certifica conexión runtime, dominios ni revocación. Mantener app y datos cliente intactos. Siguiente: CI, preview aislado y verificación Firebase Control; no usar datos reales en pruebas.

## V04 — CRUD lógico y módulos por aplicación
Consultar [V04](V04_CATALOG_MAINTENANCE.md). IDs nuevos inmutables, transacciones para rechazar duplicados, nombres editables, archivos lógicos auditados. Módulos vinculados a app desde catálogo y seleccionables en licencias sin escribir IDs manualmente; backend valida existencia y estado. **Los IDs históricos CTY, HTL y HTW no se migran**. No usar Firebase del Preview con datos reales para probar CRUD. El manifiesto de módulos de cada aplicación y la autorización multisede siguen pendientes de integración y pruebas.
