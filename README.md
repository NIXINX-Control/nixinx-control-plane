# NIXINX Control Plane
PWA mobile-first para gestión central de clientes, aplicaciones y licencias NIXINX.
## Inicio
`npm install`, copiar `.env.example` a `.env.local`, configurar proyecto Firebase, habilitar Firebase Authentication (email/password), configurar Admin SDK y `NIXINX_ADMIN_UIDS`, `npm run dev`.
## Seguridad
API admin requiere Firebase ID token de un administrador listado. Firestore client-side está denegado por defecto. La API /api/entitlements usa membresías tenantMembers y licencia id `tenantId_appId`. **No usar como gateway M2M de producción**: debe implementarse identidad servicio-a-servicio antes de conectar aplicaciones externas.
## Alcance
UI navegable + CRUD inicial + auditoría y decisión de licencia. Sin facturación real, scheduler, conciliación o despliegue productivo. No se cargan datos demo.
## Fuente de verdad
[docs/FUENTE_DE_VERDAD.md](docs/FUENTE_DE_VERDAD.md)
