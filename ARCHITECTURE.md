# Arquitectura — Inventario El Deber 2

Documento de referencia para incorporarse al proyecto. Explica **por qué** está
organizado así, no qué hace cada archivo (para eso está el código).

## 1. Qué es esta aplicación

Un frontend React + TypeScript + Vite **sin backend propio**. El navegador habla
directo con **EspoCRM** por su API REST usando una API key compartida.

Consecuencia principal: `npm run build` produce archivos estáticos y el
despliegue es copiar `dist/`. No hay servidor que desplegar, ni proceso Node en
producción.

**Límite conocido y aceptado:** la API key viaja en el bundle del navegador.
Cualquiera con acceso a la app puede extraerla y llamar a EspoCRM directamente.
La protección real es el **rol del usuario API en EspoCRM**, no el frontend.
Está asumido a propósito; si algún día hace falta cerrarlo, la solución es un
proxy mínimo que guarde la key del lado servidor, no parches en el cliente.

## 2. Estructura de carpetas

```
app/          Shell: navegación, rutas, layout general
features/     Un módulo de negocio por carpeta (componentes + servicio + lógica)
  inventario/     equipos, proveedores, formulario, cámara
  prestamos/      pañol
  asignaciones/   actas de entrega
  incidencias/    tickets de soporte
  compras/        solicitudes → proformas → órdenes → sugerencias
shared/       Lo que usan varios módulos
  api/            clientes HTTP y acceso a datos
  components/     componentes de UI reutilizables
  hooks/          hooks compartidos
  utils/          utilidades puras (fechas, exportación)
  styles/         entrada de Tailwind
types/        Tipos de dominio, uno por área
```

### Regla de dependencias

```
app/  →  features/  →  shared/  →  types/
```

- `features/` **puede** importar de `shared/` y `types/`.
- `shared/` **no debe** importar de `features/`.
- Un feature puede importar de otro cuando el dominio lo justifica (Compras usa
  `getEmployees`), pero si eso se vuelve frecuente, la pieza compartida
  probablemente pertenece a `shared/`.

Verificable con `npx madge --circular --extensions ts,tsx app features shared types`.

### Por qué `inventoryService` vive en `shared/api/` y no en `features/inventario/`

Porque nueve archivos de todos los módulos lo importan: Compras necesita
`getProveedores` y `getEmployees`, Préstamos y Asignaciones necesitan
`getInventory`. En la práctica es el catálogo maestro de la aplicación, no un
detalle del módulo de inventario. Ponerlo dentro de un feature habría obligado
a que el resto importara "hacia adentro" de ese feature.

### Imports absolutos

Todo import interno usa el alias `@/` (configurado en `tsconfig.json` y
`vite.config.ts`). Es intencional: las rutas no dependen de la profundidad de
carpetas, así que mover un archivo no rompe sus imports.

```ts
import { getInventory } from '@/shared/api/inventoryService';   // sí
import { getInventory } from '../../shared/api/inventoryService'; // no
```

## 3. Acceso a datos

```
Componente  →  hook (useAsyncData)  →  servicio del feature  →  cliente HTTP  →  EspoCRM
```

Ningún componente llama a `fetch` directamente.

### Dos contratos de error, a propósito

| | `shared/api/espoClient.ts` | `shared/api/inventoryService.ts` |
|---|---|---|
| Usado por | Compras, Incidencias | Inventario, Préstamos, Asignaciones |
| Al fallar una **lectura** | lanza `EspoApiError` | devuelve datos de respaldo (`MOCK_*`) |
| Al fallar una **escritura** | lanza `EspoApiError` | lanza `InventoryApiError` |

La diferencia en **lectura** es deliberada: en los módulos de uso diario es
preferible ver algo a ver una pantalla vacía si EspoCRM parpadea.

En **escritura** ambos lanzan, sin excepción. Antes no era así: las escrituras
del inventario devolvían un id inventado (`local-...`) cuando fallaban y la
interfaz daba el guardado por bueno, perdiendo el dato en silencio. Leer con
respaldo es defendible; escribir con respaldo no.

### Paginación

EspoCRM devuelve **máximo 200 registros por petición** y pedirle más responde
vacío. Toda lista debe paginar. Está centralizado:

- `createEspoList(espoFetch)` en `espoClient.ts` (Compras, Incidencias)
- `fetchAllPages()` en `inventoryService.ts` (Inventario y afines)

No escribir bucles de paginación nuevos: usar estos. Hay tests de regresión en
`shared/api/espoClient.test.ts` — existen porque este fallo llegó a producción
y ocultó 229 de 429 equipos sin dar ningún error.

### Nombres de entidad configurables

Las entidades de Compras se resuelven por variable de entorno con valor por
defecto (`VITE_PURCHASE_ORDER_ENTITY`, etc.). No es sobreingeniería: cuando las
entidades reales de EspoCRM resultaron llamarse distinto a lo planeado, el
arreglo fueron cuatro líneas en `.env` en vez de tocar código.

## 4. Manejo de estado

No hay store global ni librería de estado. No hace falta: cada módulo es
autónomo y lo único que cruza fronteras es la navegación entre Solicitudes y
Órdenes de Compra, que son dos props en `app/App.tsx`.

| Tipo | Dónde vive |
|---|---|
| Server state | `useAsyncData` + caché del servicio |
| Local / UI state | `useState` dentro del componente |
| Derived state | `useMemo`, nunca duplicado en `useState` |
| Form state | `useState` en el formulario |
| Global | solo `purchaseNav` en `App.tsx` (navegación cruzada) |

### `useAsyncData`

Reemplaza el trío `loading` / `error` / `refresh` que antes cada módulo escribía
a mano. Devuelve `{ data, setData, loading, error, setError, refresh }`.

Detalle importante: descarta respuestas de peticiones viejas que llegan tarde
(dos `refresh` seguidos no pueden dejar los datos antiguos pisando a los nuevos).

`loading` es **carga de datos**. Para un guardado en curso se usa un `saving`
separado; mezclarlos hacía que un guardado mostrara el spinner de la lista.

### Caché

`inventoryService` cachea 60s con deduplicación de peticiones en vuelo y un
contador de generación que descarta lecturas obsoletas tras una escritura. En la
práctica, navegar entre módulos no vuelve a descargar el inventario.

## 5. Rutas

Ruteo por hash en `app/App.tsx`, sin dependencias externas. Los módulos se
cargan con `lazy()`, así que cada uno viaja en su propio chunk.

Limitación actual: las rutas no aceptan parámetros, así que no se puede enlazar
a un registro concreto (`#/ordenes/123`). Si eso hace falta, es el momento de
meter un router de verdad.

## 6. Estilos

Tailwind **compilado** (PostCSS), no por CDN. Configuración en
`tailwind.config.js`; entrada en `shared/styles/index.css`.

Consecuencia práctica: Tailwind escanea el **código fuente**, no el DOM. Una
clase construida dinámicamente no existe en el CSS final:

```tsx
className={`text-${color}-600`}                    // no funciona
className={NAV_ACTIVE_COLOR[color]}                // sí (clases completas)
```

Por eso `App.tsx` mantiene una tabla de clases completas.

## 7. Rendimiento

- **Code splitting por módulo** con `lazy()`.
- **xlsx se carga bajo demanda**: `downloadXlsx` hace `await import('xlsx')`.
  Es una librería de ~500 KB y nueve archivos importan `reportUtils`; con el
  import estático, abrir cualquier módulo la descargaba aunque nadie exportara.
  **No volver a importar xlsx de forma estática.**
- **Listas largas paginadas** en el cliente (Dashboard, Incidencias).

Techo conocido: la app descarga la lista completa y filtra en el navegador.
Funciona bien en el orden de cientos de registros. Pasado el millar conviene
mover el filtro al servidor — EspoCRM acepta `where` y `select`.

## 8. Testing

`npm test` (Vitest). El criterio es **valor, no cobertura**: se testea lo que
duele si se rompe y no se ve a simple vista.

- Cálculos de importes (subtotales, impuestos, descuentos)
- Transiciones de estado de Compras (11 estados)
- Paginación del cliente EspoCRM (regresión del bug de los 229 equipos)
- `useAsyncData`, incluida la condición de carrera
- Utilidades de fecha (incluido el corrimiento por zona horaria)

No se testean componentes de presentación ni se escriben tests para subir un
porcentaje.

## 9. Validaciones

```bash
npm run typecheck   # TypeScript en modo strict
npm run lint        # ESLint
npm test            # Vitest
npm run build       # build de producción
```

Las cuatro deben pasar antes de dar un cambio por terminado.

## 10. Decisiones que conviene no revertir sin motivo

| Decisión | Por qué |
|---|---|
| Sin store global | No hay estado compartido real que lo justifique |
| Sin React Query | La caché propia ya cubre TTL, deduplicación e invalidación |
| Dos contratos de error en lectura | Coste distinto del error según el módulo |
| `any` en el mapeo de EspoCRM | Frontera con JSON sin tipar; está acotado a los `map*()` |
| Imports `@/` absolutos | Sobreviven a mover archivos |
| Paginación obligatoria | El fallo silencioso ya ocurrió una vez |

## 11. Deuda técnica conocida

- Layout maestro-detalle duplicado en 4 managers. Extraer un `<MasterDetail>`
  cuando llegue el quinto módulo, no antes.
- El selector de equipos está copiado entre Préstamos y Asignaciones.
- Vista de impresión repetida en 3 módulos.
- `LoanManager` (858 líneas) y `PurchaseRequestManager` (789) mezclan lista,
  formulario, detalle e impresión en un solo archivo.
- Filtrado en el cliente (ver §7).
