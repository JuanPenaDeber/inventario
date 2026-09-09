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
