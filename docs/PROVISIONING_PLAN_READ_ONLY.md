# NIXINX — Aprovisionamiento: primer PLAN read-only

Fecha 2026-11-24. Base Control main 26f569139456da1d9197f564ff5018990aca23db. Fuente rectora: [FDV NIXINX](https://github.com/NIXINX-Business-Transformation/nixinx-dwh/blob/main/docs/fdv/NIXINX_FDV_INDEX.md), enmienda integral del 23-Nov.

POST /api/admin/provisioning/plan con sesión staff existente. Entrada exclusiva appId, tenantId opcional. Lee catálogos, licencia, configuraciones, instalaciones y registro de propietario Firebase existentes, en transacción read-only. No crea colección nueva, no consulta datos del cliente, no retorna SDK config ni credenciales. Devuelve faltantes, conflictos y verificaciones pendientes; jamás otorga autorización comercial ni certifica readiness técnica. No se infiere slug de IDs legacy, no se sobrescriben instalaciones ni se activa licencia. El catálogo actual limita el precheck a 500 registros por tipo; fallo cerrado al excederlo.

Los tres escenarios se distinguen a partir del registro existente: producto, cliente nuevo con producto, cliente existente con producto. Esta primera fase es descubrimiento de Control, no automatización cloud. No presupone que un producto ya esté publicado o que su manifest esté autenticado. Próxima fase: descubrimiento de recursos reales según matriz por producto y autorización delegada, incluyendo GitHub, Vercel, GCP/Firebase y Stripe cuando corresponda. No desarrollar portal cliente ni modificar Corporate productivo.

Pruebas: npm run test y npm run build por CI. No ejecutar APPLY, no activar clientes, no desplegar a producción por este PR.
