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
## Continuidad
Antes de tocar código leer este documento, README y estado real de GitHub. Trabajar en rama, probar, PR. Nunca afirmar deploy o conexión de producción sin evidencia.

## V03 — nuevo incremento (rama, no producción)
Consultar [contrato global](https://github.com/NIXINX-Business-Transformation/nixinx-dwh/blob/main/docs/architecture/NIXINX_SOFTWARE_CONTROL_VERCEL_ARCHITECTURE_20261121.md) y [V03](V03_TENANT_CONFIGURATION.md). Catálogo borrador de configuración por cliente/app; no certifica conexión runtime, dominios ni revocación. Mantener app y datos cliente intactos. Siguiente: CI, preview aislado y verificación Firebase Control; no usar datos reales en pruebas.
