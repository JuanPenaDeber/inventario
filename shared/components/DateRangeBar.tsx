import React from 'react';
import { Calendar, Download, RotateCcw } from 'lucide-react';
import { today, daysAgo } from '../services/reportUtils';

interface DateRangeBarProps {
    startDate: string;
    endDate: string;
    onChange: (startDate: string, endDate: string) => void;
    onExport: () => void;
    /** Cuántos registros se están mostrando tras filtrar. */
    shown: number;
    /** Total de registros sin filtrar. */
    total: number;
    /** Color de acento, para combinar con el módulo. */
    accent?: 'orange' | 'indigo' | 'teal' | 'cyan';
    /** Texto en plural: "préstamos", "asignaciones"... */
    label: string;
}

const ACCENT = {
    orange: {
        ring: 'focus:ring-orange-500',
        btn: 'bg-orange-600 hover:bg-orange-700',
        chip: 'text-orange-700 bg-orange-50 hover:bg-orange-100 border-orange-200',
    },
    indigo: {
        ring: 'focus:ring-indigo-500',
        btn: 'bg-indigo-600 hover:bg-indigo-700',
        chip: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
    },
    teal: {
        ring: 'focus:ring-teal-500',
        btn: 'bg-teal-600 hover:bg-teal-700',
        chip: 'text-teal-700 bg-teal-50 hover:bg-teal-100 border-teal-200',
    },
    cyan: {
        ring: 'focus:ring-cyan-500',
        btn: 'bg-cyan-600 hover:bg-cyan-700',
        chip: 'text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
    },
};

/**
 * Barra de filtro por fecha (un día concreto o un rango) + exportación a Excel.
 * Si no se elige ninguna fecha, no filtra nada.
 */
const DateRangeBar: React.FC<DateRangeBarProps> = ({
    startDate,
    endDate,
    onChange,
    onExport,
    shown,
    total,
    accent = 'orange',
    label,
}) => {
    const c = ACCENT[accent];
    const hasFilter = !!startDate || !!endDate;

    const setToday = () => {
        const t = today();
        onChange(t, t);
    };
    const setLastDays = (n: number) => onChange(daysAgo(n), today());
    const clear = () => onChange('', '');

    const inputCls = `px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${c.ring}`;
    const chipCls = `px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${c.chip}`;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 no-print">
            <div className="flex flex-wrap items-end gap-3">
                {/* Desde */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={(e) => onChange(e.target.value, endDate)}
                        className={inputCls}
                    />
                </div>

                {/* Hasta */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => onChange(startDate, e.target.value)}
                        className={inputCls}
                    />
                </div>

                {/* Atajos */}
                <div className="flex items-center gap-2 pb-0.5">
                    <button onClick={setToday} className={chipCls}>
                        <Calendar size={13} className="inline mr-1 -mt-0.5" />
                        Hoy
                    </button>
                    <button onClick={() => setLastDays(7)} className={chipCls}>
                        7 días
                    </button>
                    <button onClick={() => setLastDays(30)} className={chipCls}>
                        30 días
                    </button>
                    {hasFilter && (
                        <button
                            onClick={clear}
                            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"
                        >
                            <RotateCcw size={13} />
                            Limpiar
                        </button>
                    )}
                </div>

                {/* Exportar */}
                <div className="ml-auto flex items-center gap-3 pb-0.5">
                    <span className="text-xs text-slate-500">
                        Mostrando <strong className="text-slate-700">{shown}</strong> de {total} {label}
                    </span>
                    <button
                        onClick={onExport}
                        disabled={shown === 0}
                        className={`px-4 py-2 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${c.btn}`}
                    >
                        <Download size={16} />
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Aviso cuando se filtra por un solo día */}
            {startDate && startDate === endDate && (
                <p className="mt-2 text-xs text-slate-400">
                    Filtrando por un día concreto: {startDate}
                </p>
            )}
        </div>
    );
};

export default DateRangeBar;
