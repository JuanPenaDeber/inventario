<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Y39sUeTTlDqBdUuc40m35JaYKUsUIE_z

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

3. Copiá la plantilla de variables de entorno y completá la API key:
   `cp .env.example .env`

La API key de EspoCRM (`VITE_ESPOCRM_API_KEY`) es **obligatoria** — sin ella
la app no arranca (ver [.env.example](.env.example)). Las URLs/entidades de
EspoCRM de Compras e Incidencias tienen valores por defecto embebidos en cada
`features/*/`; solo hace falta descomentar y ajustar en `.env` si alguna
entidad real de tu EspoCRM se llama distinto (ver [.env.example](.env.example)
para la lista completa, todas comentadas).

Otros scripts:
- `npm run typecheck` — corre `tsc --noEmit` (TypeScript en modo `strict`).
- `npm run build` — build de producción con Vite (con code-splitting por vista).

## Arquitectura: qué es esto y qué límites tiene

Para el detalle de carpetas, reglas de dependencias, contrato de errores,
manejo de estado y roles/permisos, ver **[ARCHITECTURE.md](ARCHITECTURE.md)**
— acá quedan solo los puntos que más importa ver antes de tocar el código:

> ⚠️ **La API key de EspoCRM viaja en el bundle del navegador.** No hay
> backend propio: [shared/api/espoClient.ts](shared/api/espoClient.ts) y
> [shared/api/inventoryClient.ts](shared/api/inventoryClient.ts) llaman a la
> API REST de EspoCRM directo desde el navegador de quien use la app.
> Cualquiera con acceso a las devtools puede extraer la key y usarla
> directamente contra tu EspoCRM, con los mismos permisos que tiene la app.
> Esto es un **riesgo aceptado a propósito** mientras la app viva en una red
> interna de confianza. Si algún día se expone a internet abierto o maneja
> datos más sensibles, la corrección real es un backend/proxy delgado que
> guarde la key del lado del servidor — ver ARCHITECTURE.md §1.

**Sin login real** — "quién soy" es elegir una persona de una lista (barra
"Quién soy" arriba de cada módulo). El ROL de esa persona sí se resuelve
automáticamente (EspoCRM, con una tabla local de respaldo) y controla qué
botones se ven — es una capa de interfaz, no autenticación real. Ver
ARCHITECTURE.md §12 para el detalle. Incidencias tiene además un portal
público + login con contraseña (`VITE_ADMIN_PASSWORD`) ya construido en
[features/incidencias/IncidentsModule.tsx](features/incidencias/IncidentsModule.tsx),
pero **apagado** (`ENABLE_USER_PORTAL = false`): hoy ese menú va directo al
panel administrativo, sin login — queda listo para reactivarlo el día que
haga falta un portal donde cualquiera reporte un ticket.

**TypeScript corre en modo `strict`** (`tsconfig.json`).

**Ruteo por hash de URL** (`app/App.tsx`, sin dependencias nuevas): cada vista
principal se refleja en `location.hash` (ej. `#PURCHASE_ORDERS`), así que se
puede recargar la página, compartir un enlace, o usar el botón atrás del
navegador sin perder la vista actual. Las pantallas de alta/edición de
inventario (`ADD_ITEM`/`EDIT_ITEM`) quedan fuera a propósito: dependen de un
ítem completo en memoria, no de algo serializable a una URL.

**Cada vista carga su propio código bajo demanda** (`React.lazy` + `Suspense`
en `App.tsx`), y cada módulo tiene su propio `<ErrorBoundary compact>`
([shared/components/ErrorBoundary.tsx](shared/components/ErrorBoundary.tsx)):
un error de render en un módulo no tapa a los demás, que siguen usables desde
el menú de arriba.

**Código retirado**: la dependencia `@google/genai` y su servicio asociado no
se usaban en ningún lado — eran un sobrante de la plantilla original ("AI
Studio") que nunca se conectó a la app. El botón de "escanear código de
barras" en [features/inventario/CameraModal.tsx](features/inventario/CameraModal.tsx)
**sigue siendo una simulación** (genera un código aleatorio, no lee un código
de barras real) — no se tocó porque sí está en uso desde `InventoryForm.tsx`,
pero queda pendiente decidir si se reemplaza por una librería real de escaneo
o se retira.

## Módulo: Solicitudes de Compra (flujo completo, Fases 1 a 4)

Módulo del flujo completo **Solicitante → Solicitud → Aprobación →
Cotización/Proformas → Comparación → Selección → Orden de compra →
Finalización**, implementado de punta a punta:

- **Fase 1**: creación de la solicitud, líneas de producto, envío a
  aprobación, cancelación e histórico auditable.
- **Fase 2**: aprobación/rechazo por el jefe inmediato, con la regla de
  auto-aprobación. El rol de quien decide se resuelve solo desde la barra
  "Quién soy" — ver "Sobre roles" más abajo.
- **Fase 3**: proformas de proveedores (con archivo adjunto opcional),
  cálculo de vigencia, comparación, selección justificada y generación
  automática de una Orden de Compra real (`features/compras/ordenes/purchaseOrderService.ts`).
- **Fase 4**: sugerencias de productos por área/cargo (configurables), rol
  `COMPRAS`/`ADMINISTRADOR` habilitando las acciones de la Fase 3, y un
  dashboard con los indicadores del flujo completo.

Vive en:
- [types/purchaseRequests.ts](types/purchaseRequests.ts), [types/proformas.ts](types/proformas.ts), [types/suggestions.ts](types/suggestions.ts) — `PurchaseRequest`, `PurchaseRequestLine`, `PurchaseRequestHistoryEntry`, `PurchaseRequestStatus`, `Proforma`, `ProformaLine`, `ProductSuggestion`.
- [features/compras/solicitudes/purchaseRequestService.ts](features/compras/solicitudes/purchaseRequestService.ts) — capa de acceso a EspoCRM para la solicitud, aislada del resto de servicios.
- [features/compras/proformas/proformaService.ts](features/compras/proformas/proformaService.ts) — proformas/cotizaciones (entidad y adjuntos aparte, aislado).
- [features/compras/sugerencias/suggestionService.ts](features/compras/sugerencias/suggestionService.ts) — sugerencias de productos por área/cargo.
- [features/compras/solicitudes/PurchaseRequestManager.tsx](features/compras/solicitudes/PurchaseRequestManager.tsx) — orquestador: listado, búsqueda, filtros, resumen por estado y la barra "Quién soy" (`shared/components/CurrentUserBar.tsx`, montada en `App.tsx`).
- [features/compras/solicitudes/components/PurchaseRequestDetail.tsx](features/compras/solicitudes/components/PurchaseRequestDetail.tsx) — detalle, decisión del jefe, histórico.
- [features/compras/solicitudes/usePurchaseRequestManager.ts](features/compras/solicitudes/usePurchaseRequestManager.ts) — estado y acciones (hook), incluida la gate de permisos por rol.
- [features/compras/proformas/ProformaPanel.tsx](features/compras/proformas/ProformaPanel.tsx) — registro de proformas, comparación y selección (dentro del detalle de la solicitud).
- [features/compras/sugerencias/SuggestionManager.tsx](features/compras/sugerencias/SuggestionManager.tsx) — configuración de sugerencias (menú Ajustes, solo rol Administrador).
- [features/compras/PurchaseDashboard.tsx](features/compras/PurchaseDashboard.tsx) — indicadores del flujo completo.

### Mejoras aplicadas tras la primera entrega

- **Variables de entorno centralizadas**: todas las `VITE_*` de Órdenes de
  Compra, Solicitudes, Proformas y Sugerencias quedaron documentadas
  (comentadas) en un solo lugar: [.env.example](.env.example).
- **Sin truncado silencioso de listas**: `getPurchaseOrders`,
  `getPurchaseRequests` y `getProductSuggestions` recorren todas las páginas
  de EspoCRM en vez de quedarse con las primeras 200 (con un tope de
  seguridad de 25 páginas para no entrar en un bucle infinito).
- **Límite de tamaño en adjuntos de proforma** (5 MB): evita payloads
  gigantes contra EspoCRM; se avisa en el formulario antes de intentar subir.
- **Confirmación antes de Aprobar/Rechazar** una solicitud (Cancelar ya la
  tenía).
- **Mensaje claro si la Orden de Compra se genera pero la solicitud no se
  actualiza**: en vez de un error genérico, indica exactamente qué orden se
  creó y qué solicitud quedó desincronizada, para revisión manual.
- **Anular una proforma** (`voidProforma`): no se borra ni se edita — se
  marca "anulada" con motivo obligatorio, queda visible mas no seleccionable
  ni contable para "Marcar como cotizada".
- **Navegación cruzada entre módulos**: "Ver orden de compra" desde una
  solicitud lleva directo a Órdenes de Compra con la referencia ya buscada;
  el Dashboard lista las proformas próximas a vencer/vencidas con un enlace
  directo a su solicitud.
- **[shared/api/espoClient.ts](shared/api/espoClient.ts)**: cliente HTTP compartido por los
  servicios de Compras e Incidencias (antes cada uno repetía casi igual su
  propia clase de error, su `espoFetch` y la API key). Todas las peticiones
  tienen timeout (10s) — antes una petición colgada dejaba el spinner
  girando para siempre en vez de mostrar un error. `inventoryService.ts`
  (Inventario/Préstamos/Asignaciones) usa su propio cliente
  ([shared/api/inventoryClient.ts](shared/api/inventoryClient.ts)), con un
  contrato de errores distinto a propósito — ver ARCHITECTURE.md §3.
- **Anular proforma con panel propio**: reemplacé el `window.prompt()` inicial
  por un panel inline con textarea, consistente con el resto de decisiones
  del flujo (Aprobar/Rechazar/Seleccionar).
- Documenté como limitación conocida (no como bug con arreglo pendiente) que
  `getProformaValidity` calcula "hoy" con el reloj del navegador — correcto
  mientras todos los usuarios estén en la misma zona horaria, que es el caso
  real hoy; no hay una fuente de tiempo central posible sin backend propio.

### Sobre roles y "quién hizo la acción"

El proyecto **sigue sin login real**, pero ya no es un `<select>` de rol
suelto por módulo. Hay una barra global **"Quién soy"**
([shared/components/CurrentUserBar.tsx](shared/components/CurrentUserBar.tsx),
visible arriba de cada módulo) donde se elige una persona de una lista — nada
más. El ROL de esa persona **no se elige, se resuelve solo**
(`shared/auth/roleResolution.ts`): primero desde el campo de cargo de
`CRegistroEmpleados` en EspoCRM si está poblado, si no desde una tabla local
por nombre (`ROLE_BY_NAME`, con 3 entradas de ejemplo por reemplazar), y si
tampoco eso resuelve nada, el rol de menor privilegio (`CONSULTA`).

`shared/auth/permissions.ts` tiene la matriz operación × rol (28 operaciones:
Inventario, Préstamos, Asignaciones, Proveedores, Sugerencias, Incidencias y
las 12 de Solicitudes/Proformas/Órdenes de Compra), y `can(operation, opts?)`
—expuesto por `useCurrentUser()`— decide qué botones se muestran en cada
pantalla. Los seis roles: `CONSULTA` (solo lectura, el de menor privilegio),
`SOLICITANTE`, `SISTEMAS`, `JEFE` (aprueba solicitudes de compra de
cualquier área), `COMPRAS` (cotización, proformas, órdenes) y
`ADMINISTRADOR` (todo, incluido borrar equipos y crear empleados).

En Solicitudes de Compra puntualmente: el **Jefe** aprueba/rechaza sin
importar si coincide con el `jefeInmediatoId` registrado en la solicitud (se
muestra una advertencia visual, pero `permissions.ts` deja pasar a cualquier
JEFE — no hay forma de saber "el jefe de quién" sin más datos en EspoCRM).
**Compras** habilita registrar proformas, iniciar/cerrar la cotización,
comparar, seleccionar la proforma ganadora y generar la Orden de Compra.
"Marcar como finalizada" la habilitan `COMPRAS` y `ADMINISTRADOR`. Las
pantallas "Gestionar sugerencias" y "Gestionar proveedores" (menú Ajustes)
**sí** están bloqueadas por rol (`ADMINISTRADOR` y `COMPRAS`/`ADMINISTRADOR`
respectivamente).

**Nada de esto es seguridad real** — es deliberadamente una capa de
interfaz, no un reemplazo de autenticación. `can()` decide qué se ve, no qué
puede hacer de verdad quien tenga la API key de las devtools; la protección
real, si hace falta, es el rol del usuario API en EspoCRM. Ver
[ARCHITECTURE.md §12](ARCHITECTURE.md#12-identidad-y-roles-capa-blanda-de-ui)
para el detalle completo.

### Estados: el flujo completo de 11 estados ya tiene acción de UI

- `BORRADOR → PENDIENTE_APROBACION` (botón "Enviar a aprobación").
- `PENDIENTE_APROBACION → APROBADA` (botón "Aprobar", actuando como `JEFE`).
- `PENDIENTE_APROBACION → RECHAZADA` (botón "Rechazar"; motivo obligatorio).
- `APROBADA → EN_COTIZACION` (botón "Iniciar cotización", actuando como `COMPRAS`).
- `EN_COTIZACION → COTIZADA` (botón "Marcar como cotizada"; exige ≥1 proforma registrada).
- `COTIZADA → EN_EVALUACION → APROBADA_PARA_COMPRA` (botón "Elegir" en la
  tabla comparativa + justificación obligatoria; ambos pasos quedan en el
  histórico).
- `APROBADA_PARA_COMPRA → ORDEN_GENERADA` (botón "Generar orden de compra":
  crea una `PurchaseOrder` real con el proveedor/líneas de la proforma elegida).
- `ORDEN_GENERADA → FINALIZADA` (botón "Marcar como finalizada").
- `* → CANCELADA` desde cualquier estado no terminal.

**Regla de auto-aprobación** (`isSelfSupervised` en el servicio): si
`solicitanteId === jefeInmediatoId`, al enviar la solicitud esta pasa por
`PENDIENTE_APROBACION` y de inmediato se aprueba sola, dejando ambos pasos en
el histórico — el segundo con el texto exacto pedido: *"La solicitud fue
aprobada por el mismo solicitante debido a que posee la autoridad
correspondiente."*

Una solicitud enviada (`PENDIENTE_APROBACION` en adelante) ya **no se puede
editar** — el servicio lo rechaza aunque se intente desde fuera de la UI.
`RECHAZADA`, `FINALIZADA` y `CANCELADA` son terminales: ninguna transición
sale de ahí.

### ⚠️ Contrato pendiente de confirmar con EspoCRM

Igual que con Órdenes de Compra, **esta entidad todavía no existe en
EspoCRM**. Todo lo siguiente son suposiciones documentadas y centralizadas
como constantes en `purchaseRequestService.ts`:

| Constante | Por defecto | Variable de entorno |
|---|---|---|
| URL base de la API | `http://local.grupoeldeber.com/api/v1` | `VITE_PURCHASE_REQUESTS_API_URL` |
| Entidad cabecera | `CSolicitudCompra` | `VITE_PURCHASE_REQUEST_ENTITY` |
| Sub-recurso de líneas | `detalle` | `VITE_PURCHASE_REQUEST_LINES_SUBRESOURCE` |
| Sub-recurso de histórico | `historial` | `VITE_PURCHASE_REQUEST_HISTORY_SUBRESOURCE` |

**Campos esperados en la cabecera (`CSolicitudCompra`):** `name` (código,
generado en el frontend como `SC-AAAAMMDD-HHMMSS` — no es un correlativo real;
si el backend expone un autonumber propio, se debería usar ese en su lugar),
`fechaSolicitud`, `solicitanteId`/`solicitanteName`, `area`, `cargo`,
`jefeInmediatoId`/`jefeInmediatoName`, `motivo`, `estado`, `motivoRechazo`
(obligatorio cuando `estado = RECHAZADA`).

**Sub-recurso de líneas** — `GET/POST /{entidad}/detalle`,
`PUT/DELETE /{entidad}/detalle/{id}`: `producto`, `cantidad`, `unidad`,
`areaDestino` (opcional), `observaciones` (opcional), `prioridad` (opcional:
`BAJA`/`MEDIA`/`ALTA`).

**Sub-recurso de histórico** — `GET/POST /{entidad}/historial` (a propósito
**sin** `PUT`/`DELETE` expuestos desde este servicio, para que el histórico no
se pueda alterar ni borrar desde la interfaz normal): `usuario`, `accion`,
`estado`, `detalle` (opcional).

Nota: el `Employee` (`CRegistroEmpleados`) actual no tiene un campo "cargo",
así que por ahora es texto libre en el formulario, no viene del maestro de
empleados.

**Proformas** (`features/compras/proformas/proformaService.ts`) — tampoco existen en EspoCRM.
Se asume el modelo relacional típico de EspoCRM (no JSON embebido):

```
CSolicitudCompra (1) --- (N) CProforma (1) --- (N) CProformaDetalle
```

| Constante | Por defecto | Variable de entorno |
|---|---|---|
| Entidad de proforma | `CProforma` | `VITE_PROFORMA_ENTITY` |
| Sub-recurso de proformas (bajo la solicitud) | `proformas` | `VITE_PROFORMAS_SUBRESOURCE` |
| Sub-recurso de líneas (bajo la proforma) | `lineas` | `VITE_PROFORMA_LINES_SUBRESOURCE` |

Campos de `CProforma`: `proveedorId`/`proveedorName` (link a `CProveedor`),
`numero`, `fechaEmision`, `diasValidez`, `fechaVencimiento` (calculada y
enviada ya resuelta), `moneda`, `descuento`, `impuestoPorcentaje`,
`impuestoMonto`, `subtotal`, `total`, `condicionesPago`, `tiempoEntrega`,
`observaciones`, `archivoId`/`archivoNombre`, `registradoPor`. Campos de
`CProformaDetalle`: `producto`, `cantidad`, `precioUnitario`, `subtotal`.

**Una proforma no se edita una vez registrada** (decisión de diseño: si hubo
un error, se registra una proforma corregida — así el histórico de
cotizaciones recibidas queda íntegro sin necesitar auditoría de ediciones).

**Adjuntos**: se asume el endpoint estándar de EspoCRM `POST /Attachment` con
`{ name, type, role: "Attachment", relatedType, field, file: dataURL }`. Si
falla (contrato no confirmado, backend caído), la proforma se guarda igual
**sin adjunto** — nunca bloquea el registro.

**Sugerencias** (`features/compras/sugerencias/suggestionService.ts`) — entidad `CSugerenciaProducto`
(configurable con `VITE_SUGGESTION_ENTITY`) con `area`, `cargo`, `producto`.

### Cómo probar el módulo

1. `npm run dev` y entra a **"Solicitudes de compra"** en el menú.
2. **Crear**: "Nueva Solicitud" → elige solicitante (autocompleta el área),
   cargo, jefe inmediato (una persona **distinta** del solicitante, para
   probar el flujo normal), motivo, y agrega una o más líneas de producto
   (cantidad entera > 0 y unidad son obligatorias).
3. **Guardar borrador vs. enviar**: "Guardar borrador" deja la solicitud en
   `BORRADOR` (editable); "Enviar a aprobación" además la pasa a
   `PENDIENTE_APROBACION` (deja de ser editable).
4. **Aprobar/Rechazar**: en la barra "Quién soy" (arriba de cada módulo),
   elige un empleado cuyo rol resuelva a `JEFE` (cargo "Jefe..." en EspoCRM, o
   agregalo a `ROLE_BY_NAME` en `shared/auth/roleResolution.ts`) — idealmente
   el mismo jefe inmediato de la solicitud, aunque el sistema no lo obliga.
   Con la solicitud en `PENDIENTE_APROBACION` seleccionada, aparece el panel
   "Decisión del jefe inmediato": "Aprobar" (comentario opcional) o
   "Rechazar" (el motivo es obligatorio, el botón se puede pulsar pero el
   servicio rechaza la llamada
   sin motivo).
5. **Auto-aprobación**: crea otra solicitud donde el solicitante y el jefe
   inmediato sean la **misma persona** y pulsa "Enviar a aprobación" — debe
   quedar `APROBADA` de inmediato, con dos entradas en el histórico ("Envió
   la solicitud para aprobación" y "Se autoaprobó").
6. **Editar/Cancelar**: en el detalle, "Editar" solo aparece si está en
   `BORRADOR`; "Cancelar" aparece mientras no esté en un estado terminal
   (`RECHAZADA`, `FINALIZADA`, `CANCELADA`).
7. **Histórico**: cada acción (crear, editar, enviar, aprobar, rechazar,
   cancelar) agrega una entrada de solo-lectura al histórico de la solicitud,
   visible en el panel de detalle.
8. **Filtros y exportación**: búsqueda por código/solicitante/área/cargo/jefe
   /producto, filtro por estado, por rango de fecha de solicitud, y
   "Exportar Excel" para lo que esté filtrado.
9. **Sugerencias**: elige en "Quién soy" a alguien con rol `ADMINISTRADOR`,
   entra a Ajustes → "Gestionar sugerencias" y registra una combinación
   área/cargo/producto. Al crear una solicitud con esa misma área y cargo,
   aparecen chips "+ Producto" sobre el detalle de productos para agregarlo
   con un clic.
10. **Cotización**: en "Quién soy" elige a alguien con rol `COMPRAS`. Con una
    solicitud `APROBADA` seleccionada, pulsa "Iniciar cotización" → pasa a
    `EN_COTIZACION`. Ahí aparece "Registrar proforma": completa proveedor,
    número, fecha de emisión, días de validez (la fecha de vencimiento se
    calcula sola), moneda, descuento, impuesto, condiciones de pago, tiempo
    de entrega, productos cotizados y, opcionalmente, un archivo. Registra
    dos o más proformas para poder comparar.
11. **Marcar como cotizada**: con al menos una proforma registrada, pulsa
    "Marcar como cotizada" → pasa a `COTIZADA` y aparece la tabla comparativa
    (producto por proveedor, tiempo de entrega, total).
12. **Selección**: pulsa "Elegir" en la columna de la proforma ganadora,
    escribe una justificación (obligatoria — no tiene que ser la más barata)
    y confirma → pasa a `APROBADA_PARA_COMPRA`.
13. **Generar orden de compra**: pulsa "Generar orden de compra" → crea una
    `PurchaseOrder` real (visible en "Órdenes de compra") con el proveedor y
    las líneas de la proforma elegida, y la solicitud pasa a `ORDEN_GENERADA`.
14. **Finalizar**: pulsa "Marcar como finalizada" (actuando como `COMPRAS` o
    `ADMINISTRADOR`) → pasa a `FINALIZADA`, el estado terminal del flujo.
15. **Dashboard**: entra a "Dashboard de Compras" para ver los indicadores
    (pendientes de aprobación, en cotización, proformas próximas a vencer o
    vencidas, pendientes de selección, órdenes generadas, finalizadas, etc.).

## Módulo: Órdenes de Compra

Gestión de solicitudes de compra a proveedores (`CProveedor`), con detalle de
productos, cálculo automático de subtotal/impuesto/total y recepción total o
parcial. Vive en:

- [types/purchaseOrders.ts](types/purchaseOrders.ts) — `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatus`.
- [features/compras/ordenes/purchaseOrderService.ts](features/compras/ordenes/purchaseOrderService.ts) — capa de acceso a EspoCRM, aislada del resto de servicios.
- [features/compras/ordenes/PurchaseOrderManager.tsx](features/compras/ordenes/PurchaseOrderManager.tsx) — orquestador: listado, búsqueda, filtros, resumen de totales.
- [features/compras/ordenes/usePurchaseOrderManager.ts](features/compras/ordenes/usePurchaseOrderManager.ts) — estado y acciones (hook), incluida la gate de permisos por rol (`order.manage`/`order.cancel`/`order.receive`, solo `COMPRAS`/`ADMINISTRADOR`, `order.receive` también `SISTEMAS`).
- [features/compras/ordenes/PurchaseOrderForm.tsx](features/compras/ordenes/PurchaseOrderForm.tsx) — alta/edición con líneas dinámicas.
- [features/compras/ordenes/components/PurchaseOrderDetail.tsx](features/compras/ordenes/components/PurchaseOrderDetail.tsx) — detalle y recepción.

Estados del flujo: `BORRADOR → SOLICITADA → APROBADA → RECIBIDA`, con `CANCELADA`
disponible desde cualquier estado excepto `RECIBIDA`. No hay borrado físico: la
"baja" de una orden es cancelarla, para conservar el historial de compras.

### ⚠️ Contrato pendiente de confirmar con EspoCRM

**La entidad de órdenes de compra todavía no existe en EspoCRM.** Todo lo que
sigue son suposiciones razonables (siguiendo el patrón de `CPrestamo` /
`CAsignacion`), centralizadas como constantes en `purchaseOrderService.ts`
para que ajustarlas no toque el resto del código:

| Constante | Por defecto | Variable de entorno |
|---|---|---|
| URL base de la API | `http://local.grupoeldeber.com/api/v1` | `VITE_PURCHASE_ORDERS_API_URL` |
| Entidad cabecera | `COrdenCompra` | `VITE_PURCHASE_ORDER_ENTITY` |
| Sub-recurso de líneas | `lineas` | `VITE_PURCHASE_ORDER_LINES_SUBRESOURCE` |
| % de impuesto por defecto | `13` | `VITE_PURCHASE_ORDER_TAX_RATE` |

**Campos esperados en la entidad cabecera (`COrdenCompra`):**

| Campo EspoCRM | Tipo | Uso |
|---|---|---|
| `name` | string | Número/referencia de la orden |
| `proveedorId` | link → `CProveedor` | Proveedor |
| `proveedorName` | string (autogenerado por EspoCRM) | Nombre del proveedor |
| `fechaSolicitud` | date | Fecha de solicitud |
| `fechaEsperada` | date | Fecha esperada de entrega (opcional) |
| `solicitante` | string | Nombre de quien solicita |
| `moneda` | string | `BOB` / `USD` |
| `observaciones` | text | Opcional |
| `estado` | enum | `BORRADOR`, `SOLICITADA`, `APROBADA`, `RECIBIDA`, `CANCELADA` |
| `subtotal`, `impuestoPorcentaje`, `impuestoMonto`, `total` | float | Calculados en el frontend y enviados al guardar |

**Sub-recurso de líneas** — `GET/POST /{entidad}/{id}/lineas`,
`PUT/DELETE /{entidad}/{id}/lineas/{lineaId}`:

| Campo EspoCRM | Tipo | Uso |
|---|---|---|
| `descripcion` | string | Descripción del producto |
| `categoria` | string | Categoría (texto libre) |
| `cantidadSolicitada` | int | Cantidad pedida al proveedor |
| `cantidadRecibida` | int | Cantidad recibida hasta el momento (inicia en 0) |
| `precioUnitario` | float | Precio unitario |
| `subtotal` | float | `cantidadSolicitada * precioUnitario` |

Si el backend real modela esto distinto (por ejemplo, una entidad de líneas con
otro nombre, o un campo relacionado en vez de un sub-recurso), solo hace falta
tocar las constantes `ENTITY`, `LINES_SUBRESOURCE`, `FIELDS` y `LINE_FIELDS` en
`purchaseOrderService.ts`, y las funciones `mapOrder`/`mapLine`/
`buildOrderPayload`/`buildLinePayload`.

**Importante — creación de equipos al recibir:** `receivePurchaseOrder()`
registra la cantidad recibida por línea y marca la orden como `RECIBIDA`
cuando todas las líneas quedan completas, pero **no crea equipos (`CEquipo`)
automáticamente**. `PurchaseOrderLine.createdItemId` queda reservado para ese
enlace futuro; falta confirmar con el backend cómo debe crearse el equipo
(campos mínimos, categoría, ubicación por defecto, etc.) antes de habilitarlo.

### Cómo probar el módulo

1. `npm run dev` y entra a la app.
2. En el menú superior (o el menú móvil), abre **"Órdenes de compra"**.
3. Si el backend de EspoCRM no está disponible o la entidad `COrdenCompra`
   no existe todavía, verás un listado vacío con un aviso de error — es
   esperado mientras el contrato de arriba no esté confirmado. Crear, editar,
   cancelar o recibir requiere rol `COMPRAS` o `ADMINISTRADOR` (recibir
   también admite `SISTEMAS`) — elegí un empleado con ese rol en la barra
   "Quién soy" antes de seguir, o "Nueva Orden" no va a aparecer.
4. **Crear**: botón "Nueva Orden" → completa referencia, proveedor, fechas,
   solicitante, moneda e impuesto → agrega una o más líneas de producto →
   el subtotal/impuesto/total se recalculan solos. Intentar guardar con
   campos vacíos o cantidades/precios inválidos muestra validaciones inline
   sin enviar la solicitud.
5. **Editar / Cancelar**: selecciona una orden en la lista para ver su
   detalle; desde ahí puedes editarla (si no está `RECIBIDA` ni `CANCELADA`)
   o cancelarla.
6. **Recepción parcial**: con una orden en `SOLICITADA` o `APROBADA`, en el
   detalle aparece "Registrar recepción" para indicar cuánto llegó de cada
   línea (puede ser menos que lo solicitado). La orden pasa a `RECIBIDA`
   solo cuando todas las líneas están completas.
7. **Filtros y exportación**: la barra de filtros permite buscar por
   referencia/proveedor/solicitante, filtrar por estado y por rango de
   fechas de solicitud; "Exportar Excel" descarga lo que esté filtrado, e
   "Imprimir" genera una vista de impresión de la orden seleccionada.
