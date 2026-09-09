import { describe, it, expect } from 'vitest';
import { isWithinDateRange, formatDate, formatDateTime, toISODate, daysAgo, rangeSuffix } from '@/shared/utils/reportUtils';

describe('filtro por rango de fechas', () => {
  it('sin rango definido no filtra nada', () => {
    expect(isWithinDateRange('2026-05-10', '', '')).toBe(true);
  });

  it('incluye los extremos del rango', () => {
    expect(isWithinDateRange('2026-05-01', '2026-05-01', '2026-05-31')).toBe(true);
    expect(isWithinDateRange('2026-05-31', '2026-05-01', '2026-05-31')).toBe(true);
  });

  it('excluye lo que queda fuera', () => {
    expect(isWithinDateRange('2026-04-30', '2026-05-01', '2026-05-31')).toBe(false);
    expect(isWithinDateRange('2026-06-01', '2026-05-01', '2026-05-31')).toBe(false);
  });

  it('un timestamp completo cuenta en su día local, no en el UTC', () => {
    // Este es el motivo por el que existe la comparación por día en vez de
    // por milisegundos: un registro creado a las 23:00 hora local cae al día
    // siguiente en UTC, y antes se salía del rango sin explicación.
    expect(isWithinDateRange('2026-05-31T23:30:00', '2026-05-01', '2026-05-31')).toBe(true);
  });

  it('acepta solo fecha desde, o solo fecha hasta', () => {
    expect(isWithinDateRange('2026-05-10', '2026-05-01', '')).toBe(true);
    expect(isWithinDateRange('2026-04-10', '2026-05-01', '')).toBe(false);
    expect(isWithinDateRange('2026-05-10', '', '2026-05-31')).toBe(true);
    expect(isWithinDateRange('2026-06-10', '', '2026-05-31')).toBe(false);
  });
});

describe('formato de fechas', () => {
  it('formatDate devuelve cadena vacía si no hay valor o no es válido', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('no-es-fecha')).toBe('');
  });

  it('formatDateTime devuelve el guion largo si no hay valor', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('no-es-fecha')).toBe('—');
  });

  it('formatDateTime incluye la hora (no solo la fecha)', () => {
    // Antes existían dos copias de esta función con locales distintos
    // (es-EC y es-BO), así que la misma fecha se veía diferente por módulo.
    const out = formatDateTime('2026-05-10T14:30:00');
    expect(out).toMatch(/\d{2}[:.]\d{2}/);
  });

  it('toISODate usa la fecha local, sin corrimiento por zona horaria', () => {
    const d = new Date(2026, 0, 5); // 5 de enero de 2026, hora local
    expect(toISODate(d)).toBe('2026-01-05');
  });

  it('daysAgo retrocede la cantidad de días pedida', () => {
    const hoy = new Date();
    const esperado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7);
    expect(daysAgo(7)).toBe(toISODate(esperado));
  });
});

describe('sufijo de nombre de archivo', () => {
  it('sin rango marca el archivo como "todos"', () => {
    expect(rangeSuffix('', '')).toBe('todos');
  });

  it('con rango incluye ambas fechas', () => {
    expect(rangeSuffix('2026-05-01', '2026-05-31')).toBe('2026-05-01_a_2026-05-31');
  });

  it('si ambas fechas son la misma no la repite', () => {
    expect(rangeSuffix('2026-05-01', '2026-05-01')).toBe('2026-05-01');
  });

  it('distingue rango abierto por un extremo', () => {
    expect(rangeSuffix('2026-05-01', '')).toBe('desde_2026-05-01');
    expect(rangeSuffix('', '2026-05-31')).toBe('hasta_2026-05-31');
  });
});
