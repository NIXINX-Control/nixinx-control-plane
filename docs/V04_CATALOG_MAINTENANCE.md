# V04 — Catálogo administrativo, identificadores inmutables y vinculación de módulos

**Fecha:** 2026-11-22 · **Estado:** rama + PR de pruebas, no producción. Se apoya en V03 (PR #2, DRAFT).

## Diagnóstico previo

- V03 daba altas de clientes, aplicaciones y licencias, consultas, transición de estado de licencias y auditoría. **No permitía editar los datos visibles** de clientes, aplicaciones ni vigencias.
- Los módulos de licencias eran un campo libre separado por comas y el backend solo validaba formato, **no existencia, titularidad de app ni estado**. Por tanto un error ortográfico era aceptado.
- Ya existía protección de unicidad exacta al crear documentos mediante transacción y `tx.create`. Faltaban explicación, identificadores de dominio y validación de catálogo.
- En el Preview del propietario aparecen los tenants reales **CTY, HTL y HTW** con ID mayúsculo. **No renombrar, migrar ni usar estos registros como fixtures**. V03 `assignedHostname` exige slug minúscula: la correspondencia de tenant legado↔slug de dominio requiere diseño separado antes de activar Configurations para esos tenants.

## Contrato implementado en la rama

1. **Nuevo ID de cliente/aplicación/módulo:** minúsculas, números y guiones, longitud 2–63, inicia con letra. Es única clave técnica, no se puede editar. La API comprueba duplicados por ruta y además el alias mayúsculo de un ID legado antes del `tx.create` transaccional. **Los IDs existentes mayúsculos se preservan.**
2. **Nombre visible:** texto comercial editable sin alterar el ID ni las relaciones. Mantenimiento requiere motivo y crea auditoría; no sobrescribe historia.
3. **Módulos por aplicación:** colección `appModules` con ID físico `appId.moduleId`, y campos `appId, moduleId, name, status, verified`. **El alta manual queda en `draft, verified:false`**; no autoriza funciones. Un mismo `moduleId` puede existir en varias aplicaciones, pero la licencia solo puede elegir los de su propia aplicación si está en estado `active` y `verified:true` confirmado por un manifiesto de código de la aplicación. **V04 todavía no incorpora la importación/verificación del manifiesto y por ello NO permite activar módulos nuevos ni venderlos como disponibles.**
4. **Licencia:** ID derivado inmutable `tenantId_appId`; no se teclea. Los selectores Cliente/Aplicación no se cambian tras crear. Fechas, gracia y selección de módulos son editables con motivo auditado. Cambios de estado mantienen su API/maquina de estados separada.
5. **Baja:** no hay DELETE físico. Un cliente/app pasa a `archived`; un módulo a `retired`. Se bloquea archivar si existen licencias no terminadas o bindings Configurations de cliente/app; se bloquea retirar un módulo que figura en licencias no terminadas. Objetivo: preservar integridad de historia y contratos. Reactivar requiere cambio auditado.
6. **Anti-typo:** el frontend elimina texto libre y usa checkboxes de módulos existentes; el backend revalida cada `moduleId` contra la colección y rechaza ausentes, duplicados, inactivos, no verificados o pertenecientes a otra app.
7. **Autoridad del catálogo:** NIXINX administra los módulos; **registrar un módulo en Control NO lo incorpora al código de la PWA**. Antes de activar entitlements reales es obligatorio definir y probar el manifiesto/versionado de IDs implementados por la aplicación, su compatibilidad y sincronización. **En V04 ninguna creación manual marca un módulo como `verified`**, de modo que los typos no pueden producir una licencia funcional por accidente. No inventar módulos en producción.
8. **Alcance:** API + UI + pruebas unitarias sintéticas. No Stripe, portal cliente, autorización M2M, dominios, deploy productivo ni cambios directos en Firestore.

## Pruebas obligatorias

- Crear **en un Firebase de prueba separado**, nunca en CTY/HTL/HTW actuales, una app `initiatives` con nombre visible `Initiatives`; registrar un módulo **solo si está soportado realmente por la app**.
- Intentar crear el mismo ID otra vez → 409; intentar editar ID por API → 400. Cambiar nombre → éxito y el ID se conserva. Crear módulo → `draft` y no seleccionable hasta verificación del manifiesto.
- Licencia: comprobar ID derivado de los selectores, módulos listados solo de esa app; enviar `inventairo`, módulo de otra app, retirado o repetido por API → 400. Alterar `tenantId`/`appId` por PATCH → 400.
- Probar archivado con licencia vigente (debe bloquear 409); auditoría `CREATE_*`, `UPDATE_*`, `UPDATE_LICENSE_TERMS`; no borrado físico.
- Aislamiento: GET/POST/PATCH sin token → 401; con usuario autenticado no allowlisted → 403. No probar sobre datos de clientes.
- Verificar flujos de clientes legados HTL/HTW/CTY read-only; no reescribir IDs, no asumir subdominio compatible.

## Siguientes gates técnicos

1. Tests y build en CI, revisión PR y Preview branch V04.
2. Probar flujo completo con Firebase Preview realmente aislado; **las capturas de V03 muestran datos de clientes existentes, por lo que aún no es seguro hacer CRUD de prueba allí**.
3. Definir manifiesto de módulos por versión de cada aplicación y procedimiento de registro/control sin diferencias manuales.
4. Implementar después licencia por establecimiento conforme Charter §26.6; V04 mantiene el identificador histórico `tenantId_appId` del MVP para no romper datos y **no certifica cuota ni licencia multisede**.
5. Revisar binding de hostname para IDs legados antes de activar configuraciones de HTL/HTW/CTY.
