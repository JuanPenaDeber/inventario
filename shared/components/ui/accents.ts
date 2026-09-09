// =============================================================================
// Acentos de color por módulo.
//
// Cada módulo tiene su color: Préstamos naranja, Asignaciones índigo, Órdenes
// de Compra teal, Solicitudes cian, Incidencias rosa. Antes ese color vivía
// escrito a mano en cada cadena de clases de cada archivo, que es por qué el
// mismo input se ve distinto según dónde esté.
//
// ⚠️ Las clases van ESCRITAS ENTERAS a propósito. Tailwind escanea el código
// fuente para saber qué CSS generar, así que `focus:ring-${accent}-500` no
// existiría en el bundle: la clase se arma en runtime y el escaneo nunca la ve.
// Es el mismo patrón que App.tsx ya usa en NAV_ACTIVE_COLOR (ver la nota en
// tailwind.config.js). Cualquier acento nuevo se agrega aquí, entero.
// =============================================================================

export type Accent =
  | 'blue'
  | 'orange'
  | 'indigo'
  | 'rose'
  | 'cyan'
  | 'teal'
  | 'slate'
  | 'emerald'
  | 'purple'
  | 'amber';

/** Anillo de foco de campos de formulario. */
export const FOCUS_RING: Record<Accent, string> = {
  blue: 'focus:ring-blue-500',
  orange: 'focus:ring-orange-500',
  indigo: 'focus:ring-indigo-500',
  rose: 'focus:ring-rose-500',
  cyan: 'focus:ring-cyan-500',
  teal: 'focus:ring-teal-500',
  slate: 'focus:ring-slate-500',
  emerald: 'focus:ring-emerald-500',
  purple: 'focus:ring-purple-500',
  amber: 'focus:ring-amber-500',
};

/** Fondo y hover del botón de acción principal. */
export const SOLID_BUTTON: Record<Accent, string> = {
  blue: 'bg-blue-600 hover:bg-blue-700',
  orange: 'bg-orange-600 hover:bg-orange-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
  rose: 'bg-rose-600 hover:bg-rose-700',
  cyan: 'bg-cyan-600 hover:bg-cyan-700',
  teal: 'bg-teal-600 hover:bg-teal-700',
  slate: 'bg-slate-600 hover:bg-slate-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  purple: 'bg-purple-600 hover:bg-purple-700',
  amber: 'bg-amber-600 hover:bg-amber-700',
};

/** Fila seleccionada en una lista maestra: fondo suave + barra lateral. */
export const SELECTED_ROW: Record<Accent, string> = {
  blue: 'bg-blue-50/60 border-l-blue-500',
  orange: 'bg-orange-50/60 border-l-orange-500',
  indigo: 'bg-indigo-50/60 border-l-indigo-500',
  rose: 'bg-rose-50/60 border-l-rose-500',
  cyan: 'bg-cyan-50/60 border-l-cyan-500',
  teal: 'bg-teal-50/60 border-l-teal-500',
  slate: 'bg-slate-50/60 border-l-slate-500',
  emerald: 'bg-emerald-50/60 border-l-emerald-500',
  purple: 'bg-purple-50/60 border-l-purple-500',
  amber: 'bg-amber-50/60 border-l-amber-500',
};

/** Color del título de la fila seleccionada. */
export const SELECTED_TITLE: Record<Accent, string> = {
  blue: 'text-blue-900',
  orange: 'text-orange-900',
  indigo: 'text-indigo-900',
  rose: 'text-rose-900',
  cyan: 'text-cyan-900',
  teal: 'text-teal-900',
  slate: 'text-slate-900',
  emerald: 'text-emerald-900',
  purple: 'text-purple-900',
  amber: 'text-amber-900',
};

/** Color del icono que encabeza una sección. */
export const ICON_TINT: Record<Accent, string> = {
  blue: 'text-blue-500',
  orange: 'text-orange-500',
  indigo: 'text-indigo-500',
  rose: 'text-rose-500',
  cyan: 'text-cyan-500',
  teal: 'text-teal-500',
  slate: 'text-slate-500',
  emerald: 'text-emerald-500',
  purple: 'text-purple-500',
  amber: 'text-amber-500',
};

/** Tarjeta elegida en un selector de varios elementos. */
export const PICKED_CARD: Record<Accent, string> = {
  blue: 'bg-blue-50 border-blue-300 ring-1 ring-blue-300',
  orange: 'bg-orange-50 border-orange-300 ring-1 ring-orange-300',
  indigo: 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300',
  rose: 'bg-rose-50 border-rose-300 ring-1 ring-rose-300',
  cyan: 'bg-cyan-50 border-cyan-300 ring-1 ring-cyan-300',
  teal: 'bg-teal-50 border-teal-300 ring-1 ring-teal-300',
  slate: 'bg-slate-50 border-slate-300 ring-1 ring-slate-300',
  emerald: 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300',
  purple: 'bg-purple-50 border-purple-300 ring-1 ring-purple-300',
  amber: 'bg-amber-50 border-amber-300 ring-1 ring-amber-300',
};

/** Tarjeta no elegida: blanca, y solo insinúa el acento al pasar por encima. */
export const UNPICKED_CARD: Record<Accent, string> = {
  blue: 'bg-white border-slate-100 hover:border-blue-200',
  orange: 'bg-white border-slate-100 hover:border-orange-200',
  indigo: 'bg-white border-slate-100 hover:border-indigo-200',
  rose: 'bg-white border-slate-100 hover:border-rose-200',
  cyan: 'bg-white border-slate-100 hover:border-cyan-200',
  teal: 'bg-white border-slate-100 hover:border-teal-200',
  slate: 'bg-white border-slate-100 hover:border-slate-200',
  emerald: 'bg-white border-slate-100 hover:border-emerald-200',
  purple: 'bg-white border-slate-100 hover:border-purple-200',
  amber: 'bg-white border-slate-100 hover:border-amber-200',
};

/** Casilla marcada dentro de una tarjeta elegida. */
export const PICKED_CHECK: Record<Accent, string> = {
  blue: 'bg-blue-500 border-blue-500 text-white',
  orange: 'bg-orange-500 border-orange-500 text-white',
  indigo: 'bg-indigo-500 border-indigo-500 text-white',
  rose: 'bg-rose-500 border-rose-500 text-white',
  cyan: 'bg-cyan-500 border-cyan-500 text-white',
  teal: 'bg-teal-500 border-teal-500 text-white',
  slate: 'bg-slate-500 border-slate-500 text-white',
  emerald: 'bg-emerald-500 border-emerald-500 text-white',
  purple: 'bg-purple-500 border-purple-500 text-white',
  amber: 'bg-amber-500 border-amber-500 text-white',
};
