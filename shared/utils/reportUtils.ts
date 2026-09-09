// =============================================================================
// Utilidades compartidas para filtrar por rango de fechas y exportar a Excel.
// Las usan Incidencias, Pañol/Préstamos y Asignaciones.
// =============================================================================
import * as XLSX from 'xlsx';

/** Fecha como YYYY-MM-DD (formato de los <input type="date">). */
export function toISODate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Hoy en formato YYYY-MM-DD. */
export function today(): string {
    return toISODate(new Date());
}

/** Hace N días, en formato YYYY-MM-DD. */
export function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return toISODate(d);
}

/**
 * Reduce cualquier fecha a su día en formato YYYY-MM-DD.
 *
 * OJO con las zonas horarias: `new Date("2026-07-06")` se interpreta como
 * medianoche UTC, que en Bolivia (UTC-4) es el día ANTERIOR por la tarde.
 * Por eso, si la fecha ya viene como YYYY-MM-DD la usamos tal cual, sin
 * convertirla; y si trae hora, tomamos su día en hora local.
 */
function dayKey(value: string): string | null {
    const s = value.trim();

    // Fecha sin hora ("2026-06-30"): se usa literal, sin tocar zonas horarias.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return toISODate(d); // día en hora local
}

/**
 * ¿La fecha cae dentro del rango [startDate, endDate]?
 *
 * - Si ambos límites están vacíos, NO filtra (devuelve true).
 * - Cada límite es opcional: se puede filtrar solo "desde" o solo "hasta".
 * - Ambos límites son inclusivos, así que poner la misma fecha en los dos
 *   campos filtra por UN día concreto.
 *
 * La comparación se hace sobre el texto YYYY-MM-DD, que es ordenable
 * alfabéticamente y no sufre desfases de zona horaria.
 */
export function isWithinDateRange(
    value: string | null | undefined,
    startDate: string,
    endDate: string,
): boolean {
    if (!startDate && !endDate) return true; // sin filtro
    if (!value) return false; // hay filtro pero el registro no tiene fecha

    const day = dayKey(String(value));
    if (!day) return false;

    if (startDate && day < startDate) return false;
    if (endDate && day > endDate) return false;
    return true;
}

/** Formatea una fecha a algo legible (es-BO). Devuelve '' si no es válida. */
export function formatDate(value?: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-BO');
}

/**
 * Genera y descarga un archivo Excel (.xlsx) de verdad.
 *
 * Se usa .xlsx y no CSV a propósito: el CSV se abre mal en Excel en español
 * (espera ';' como separador y mete todo en una sola columna) y además pierde
 * las tildes según la configuración regional.
 *
 * @param rows Primera fila = encabezados; el resto, los datos.
 * @param colWidths Ancho de cada columna, en caracteres (opcional).
 */
export function downloadXlsx(
    fileName: string,
    sheetName: string,
    rows: (string | number)[][],
    colWidths?: number[],
): void {
    const sheet = XLSX.utils.aoa_to_sheet(rows);

    if (colWidths) {
        sheet['!cols'] = colWidths.map((w) => ({ wch: w }));
    }

    const book = XLSX.utils.book_new();
    // Excel no admite nombres de hoja de más de 31 caracteres.
    XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));

    // Dispara la descarga en el navegador.
    XLSX.writeFile(book, fileName);
}

/** Sufijo para el nombre del archivo según el rango elegido. */
export function rangeSuffix(startDate: string, endDate: string): string {
    if (startDate && endDate) {
        return startDate === endDate ? startDate : `${startDate}_a_${endDate}`;
    }
    if (startDate) return `desde_${startDate}`;
    if (endDate) return `hasta_${endDate}`;
    return 'todos';
}
