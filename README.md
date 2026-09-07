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
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Módulo: Solicitudes de Compra (flujo completo, Fases 1 a 4)

Módulo del flujo completo **Solicitante → Solicitud → Aprobación →
Cotización/Proformas → Comparación → Selección → Orden de compra →
Finalización**, implementado de punta a punta:

- **Fase 1**: creación de la solicitud, líneas de producto, envío a
  aprobación, cancelación e histórico auditable.
- **Fase 2**: aprobación/rechazo por el jefe inmediato, con la regla de
  auto-aprobación, y el selector ligero "Actuando como" (rol + empleado).
- **Fase 3**: proformas de proveedores (con archivo adjunto opcional),
  cálculo de vigencia, comparación, selección justificada y generación
  automática de una Orden de Compra real (`services/purchaseOrderService.ts`).
- **Fase 4**: sugerencias de productos por área/cargo (configurables), rol
  `COMPRAS`/`ADMINISTRADOR` habilitando las acciones de la Fase 3, y un
  dashboard con los indicadores del flujo completo.

Vive en:
- [types.ts](types.ts) — `PurchaseRequest`, `PurchaseRequestLine`, `PurchaseRequestHistoryEntry`, `PurchaseRequestStatus`, `Proforma`, `ProformaLine`, `ProductSuggestion`, `PurchaseFlowRole`.
- [services/purchaseRequestService.ts](services/purchaseRequestService.ts) — capa de acceso a EspoCRM para la solicitud, aislada del resto de servicios.
- [services/proformaService.ts](services/proformaService.ts) — proformas/cotizaciones (entidad y adjuntos aparte, aislado).
- [services/suggestionService.ts](services/suggestionService.ts) — sugerencias de productos por área/cargo.
- [components/PurchaseRequestManager.tsx](components/PurchaseRequestManager.tsx) — listado, búsqueda, filtros, resumen por estado, detalle, histórico y el selector "Actuando como".
- [components/PurchaseRequestForm.tsx](components/PurchaseRequestForm.tsx) — alta/edición con líneas dinámicas y chips de sugerencias.
- [components/ProformaPanel.tsx](components/ProformaPanel.tsx) — registro de proformas, comparación y selección (dentro del detalle de la solicitud).
- [components/SuggestionManager.tsx](components/SuggestionManager.tsx) — configuración de sugerencias (menú Ajustes).
- [components/PurchaseDashboard.tsx](components/PurchaseDashboard.tsx) — indicadores del flujo completo.

### Mejoras aplicadas tras la primera entrega

- **Variables de entorno centralizadas**: todas las `VITE_*` de Órdenes de
  Compra, Solicitudes, Proformas y Sugerencias quedaron documentadas
  (comentadas) en un solo lugar: [.env](.env).
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

### Sobre roles y "quién hizo la acción"

El proyecto **no tiene login ni sistema de roles hoy** (se confirmó revisando
todo el código: cada "quién hizo esto" en Préstamos/Asignaciones es un
`<select>` manual de empleados). Se decidió seguir el mismo modelo:

- **Solicitante**: se elige de una lista al crear la solicitud; su nombre
  queda como "actor" de las acciones que él mismo realiza (crear, editar,
  enviar a aprobación, cancelar).
- **Jefe (aprobador)**: `PurchaseRequestManager` tiene un selector **"Actuando
  como"** (rol + empleado, tipo `PurchaseFlowRole` en `types.ts`), persistido
  en `sessionStorage` solo por comodidad de la pestaña actual. **No hay
  contraseña ni validación real**: cualquiera puede elegir el rol `JEFE` y
  cualquier empleado, y el sistema no verifica que sea realmente el
  `jefeInmediatoId` registrado en la solicitud (si no coincide, se muestra una
  advertencia visual, pero la acción igual se permite). Esta es la base sobre
  la que la Fase 4 construirá permisos reales.
- **Compras**: rol `COMPRAS` en el mismo selector — habilita registrar
  proformas, iniciar/cerrar la etapa de cotización, comparar, seleccionar la
  proforma ganadora y generar la Orden de Compra.
- **Administrador**: rol `ADMINISTRADOR` — hoy solo se usa para poder
  "Marcar como finalizada" una solicitud (junto con `COMPRAS`). La pantalla
  "Gestionar sugerencias" (menú Ajustes) **no** está bloqueada por rol —
  sigue el mismo criterio que "Gestionar proveedores", que tampoco lo está.

Nada de esto es seguridad real: es deliberadamente ligero, tal como se acordó,
para no construir un sistema de permisos completo sin autenticación real
detrás.

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

**Proformas** (`services/proformaService.ts`) — tampoco existen en EspoCRM.
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

**Sugerencias** (`services/suggestionService.ts`) — entidad `CSugerenciaProducto`
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
4. **Aprobar/Rechazar**: en la barra "Actuando como" (arriba de la lista),
   cambia el rol a `JEFE` y elige un empleado — idealmente el mismo jefe
   inmediato de la solicitud, aunque el sistema no lo obliga. Con la solicitud
   en `PENDIENTE_APROBACION` seleccionada, aparece el panel "Decisión del jefe
   inmediato": "Aprobar" (comentario opcional) o "Rechazar" (el motivo es
   obligatorio, el botón se puede pulsar pero el servicio rechaza la llamada
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
9. **Sugerencias**: en Ajustes → "Gestionar sugerencias", registra una
   combinación área/cargo/producto. Al crear una solicitud con esa misma
   área y cargo, aparecen chips "+ Producto" sobre el detalle de productos
   para agregarlo con un clic.
10. **Cotización**: cambia "Actuando como" a `COMPRAS`. Con una solicitud
    `APROBADA` seleccionada, pulsa "Iniciar cotización" → pasa a
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

- [types.ts](types.ts) — `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatus`.
- [services/purchaseOrderService.ts](services/purchaseOrderService.ts) — capa de acceso a EspoCRM, aislada del resto de servicios.
- [components/PurchaseOrderManager.tsx](components/PurchaseOrderManager.tsx) — listado, búsqueda, filtros, resumen de totales, detalle y recepción.
- [components/PurchaseOrderForm.tsx](components/PurchaseOrderForm.tsx) — alta/edición con líneas dinámicas.

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
   esperado mientras el contrato de arriba no esté confirmado.
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
