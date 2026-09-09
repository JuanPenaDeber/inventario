// =============================================================================
// Campos de formulario.
//
// Sustituye las cuatro definiciones locales de `inputCls` / `labelCls` y los 26
// literales sueltos de 'w-full px-3 py-2 border border-slate-300 rounded-lg…'
// repartidos por el proyecto. Las cuatro copias ya habían divergido: dos usan
// etiqueta `text-sm text-slate-700` y una `text-xs text-slate-500`, sin ningún
// motivo de diseño — solo el archivo en el que nacieron.
//
// `fieldSize` recoge esa diferencia como una decisión explícita: 'md' es el
// formulario normal, 'sm' el de una tabla o un panel lateral apretado.
// =============================================================================

import React from 'react';
import { Accent, FOCUS_RING } from '@/shared/components/ui/accents';

export type FieldSize = 'sm' | 'md';

const LABEL: Record<FieldSize, string> = {
  md: 'block text-sm font-medium text-slate-700 mb-1',
  sm: 'block text-xs font-medium text-slate-500 mb-1',
};

const CONTROL: Record<FieldSize, string> = {
  md: 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2',
  sm: 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white text-sm focus:ring-2',
};

/** Clases del control (input/select/textarea) para un acento y tamaño dados. */
export const controlClass = (accent: Accent, size: FieldSize = 'md'): string =>
  `${CONTROL[size]} ${FOCUS_RING[accent]}`;

/** Clases de la etiqueta. Expuesto para los pocos casos que no usan <Field>. */
export const labelClass = (size: FieldSize = 'md'): string => LABEL[size];

interface FieldProps {
  label: string;
  /** Marca el campo como obligatorio y propaga `required` al control. */
  required?: boolean;
  size?: FieldSize;
  /** Mensaje de validación bajo el campo. */
  error?: string;
  /** Texto de ayuda, se oculta cuando hay error para no apilar dos líneas. */
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Etiqueta + control + mensaje. El control se pasa como hijo en vez de
 * generarlo aquí: los formularios del proyecto usan input, select, textarea y
 * combinaciones (input + botón "nuevo empleado"), y una prop `type` no daba
 * para todas sin volverse un componente lleno de condicionales.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  required,
  size = 'md',
  error,
  hint,
  htmlFor,
  children,
  className = '',
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className={LABEL[size]}>
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-xs text-red-600">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    ) : null}
  </div>
);

type ControlExtras = {
  accent?: Accent;
  /**
   * Tamaño visual del control. Se llama `fieldSize` y no `size` porque `size`
   * ya es un atributo nativo de <input> y <select> (ancho en caracteres):
   * reusar el nombre obligaba a tapar la prop nativa y la dejaba inaccesible.
   */
  fieldSize?: FieldSize;
};

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> &
  Pick<React.InputHTMLAttributes<HTMLInputElement>, 'size'> &
  ControlExtras;

/** `<input>` con las clases del proyecto ya puestas. */
export const Input: React.FC<InputProps> = ({ accent = 'blue', fieldSize = 'md', className = '', ...rest }) => (
  <input {...rest} className={`${controlClass(accent, fieldSize)} ${className}`} />
);

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & ControlExtras;

/** `<select>` con las clases del proyecto ya puestas. */
export const Select: React.FC<SelectProps> = ({ accent = 'blue', fieldSize = 'md', className = '', children, ...rest }) => (
  <select {...rest} className={`${controlClass(accent, fieldSize)} ${className}`}>
    {children}
  </select>
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & ControlExtras;

/** `<textarea>` con las clases del proyecto ya puestas. */
export const Textarea: React.FC<TextareaProps> = ({ accent = 'blue', fieldSize = 'md', className = '', ...rest }) => (
  <textarea {...rest} className={`${controlClass(accent, fieldSize)} ${className}`} />
);

/** Campo de solo lectura: mismo tamaño que el resto, pero claramente inerte. */
export const ReadOnlyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...rest
}) => (
  <input
    {...rest}
    readOnly
    className={`w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg outline-none cursor-not-allowed ${className}`}
  />
);
