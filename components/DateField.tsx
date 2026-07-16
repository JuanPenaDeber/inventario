import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { formatDate } from '../services/reportUtils';

interface DateFieldProps {
    label?: string;
    /** Valor en formato YYYY-MM-DD (el que usa <input type="date">). */
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    /** Clase Tailwind para el anillo de foco (combina con el módulo). */
    focusRing?: string;
}

/**
 * Campo de fecha que SIEMPRE se muestra como día/mes/año (13/07/2026).
 *
 * ¿Por qué no un <input type="date"> normal?
 * Porque el navegador dibuja su propio texto según SU idioma: en Chrome en
 * inglés sale 07/13/2026 (mes primero) y no hay forma de cambiarlo con CSS,
 * ni con el atributo lang, ni con la configuración de la página.
 *
 * Solución: dibujamos nosotros el texto en dd/mm/aaaa y dejamos el input nativo
 * encima, transparente, para conservar el calendario del navegador al hacer clic.
 */
const DateField: React.FC<DateFieldProps> = ({
    label,
    value,
    onChange,
    min,
    max,
    focusRing = 'focus-within:ring-blue-500',
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // Abre el calendario nativo. showPicker() es lo moderno; si no existe
    // (navegador viejo), al menos enfocamos el campo.
    const openPicker = () => {
        const el = inputRef.current;
        if (!el) return;
        try {
            if (typeof el.showPicker === 'function') el.showPicker();
            else el.focus();
        } catch {
            el.focus();
        }
    };

    return (
        <div>
            {label && (
                <label className="block text-xs font-medium text-slate-500 mb-1">
                    {label}
                </label>
            )}

            <div
                className={`relative flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer focus-within:ring-2 ${focusRing}`}
            >
                {/* Texto que ve el usuario: siempre día/mes/año */}
                <span
                    className={`text-sm select-none ${value ? 'text-slate-800' : 'text-slate-400'}`}
                >
                    {value ? formatDate(value) : 'dd/mm/aaaa'}
                </span>

                <Calendar size={15} className="ml-auto shrink-0 text-slate-400" />

                {/* Input real: invisible pero encima, para conservar el calendario nativo */}
                <input
                    ref={inputRef}
                    type="date"
                    value={value}
                    min={min}
                    max={max}
                    onChange={(e) => onChange(e.target.value)}
                    onClick={openPicker}
                    aria-label={label}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
        </div>
    );
};

export default DateField;
