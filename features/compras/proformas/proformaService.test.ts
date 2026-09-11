import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateProformaLineSubtotal,
  calculateProformaTotals,
  calculateExpiryDate,
  getProformaValidity,
} from '@/features/compras/proformas/proformaService';

/**
 * N días desde hoy, en fecha LOCAL (no UTC). getProformaValidity compara
 * contra medianoche local (`today.setHours(0,0,0,0)`); `.toISOString()`
 * extrae la fecha en UTC, que en cualquier huso horario no-UTC puede caer un
 * día antes o después según la hora del día en que corra el test — hacía que
 * este archivo fallara o pasara según la hora local, no según el código.
 */
function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('cálculo de importes de una proforma', () => {
  it('aplica el descuento ANTES del impuesto', () => {
    // Es la diferencia que decide qué proveedor gana una comparación:
    // 1000 - 100 = 900 de base, 13% = 117, total 1017.
    const totals = calculateProformaTotals([{ subtotal: 1000 }], 100, 13);
    expect(totals).toEqual({ subtotal: 1000, taxAmount: 117, total: 1017 });
  });

  it('sin descuento el impuesto va sobre el subtotal completo', () => {
    expect(calculateProformaTotals([{ subtotal: 1000 }], 0, 13)).toEqual({
      subtotal: 1000,
      taxAmount: 130,
      total: 1130,
    });
  });

  it('un descuento mayor al subtotal no genera una base negativa', () => {
    const totals = calculateProformaTotals([{ subtotal: 100 }], 500, 13);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('redondea el subtotal de línea a 2 decimales', () => {
    expect(calculateProformaLineSubtotal(3, 33.333)).toBe(100);
  });
});

describe('vencimiento de una proforma', () => {
  it('suma los días de validez a la fecha de emisión', () => {
    expect(calculateExpiryDate('2026-01-01', 15)).toBe('2026-01-16');
  });

  it('cruza correctamente el cambio de mes', () => {
    expect(calculateExpiryDate('2026-01-25', 10)).toBe('2026-02-04');
  });

  it('devuelve cadena vacía si la entrada no sirve', () => {
    expect(calculateExpiryDate('', 15)).toBe('');
    expect(calculateExpiryDate('no-es-fecha', 15)).toBe('');
  });

  it('marca como VENCIDA una fecha pasada y VIGENTE una lejana', () => {
    expect(getProformaValidity(localDateOffset(-1))).toBe('VENCIDA');
    expect(getProformaValidity(localDateOffset(365))).toBe('VIGENTE');
  });

  it('avisa cuando faltan pocos días (PROXIMA_A_VENCER)', () => {
    expect(getProformaValidity(localDateOffset(2), 3)).toBe('PROXIMA_A_VENCER');
  });

  it('el último día de validez todavía cuenta como no vencida', () => {
    expect(getProformaValidity(localDateOffset(0), 3)).toBe('PROXIMA_A_VENCER');
  });
});

describe('DEFAULT_PROFORMA_TAX_RATE_PERCENT / PROFORMA_EXPIRY_WARNING_DAYS (variables de entorno)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('cae a los defaults si las variables existen pero quedan vacías', async () => {
    // Regresión real: `Number(env ?? default)` no cae al default con '' (solo
    // con null/undefined) — Number('') es 0, impuesto 0% / 0 días en silencio.
    vi.stubEnv('VITE_PROFORMA_TAX_RATE', '');
    vi.stubEnv('VITE_PROFORMA_EXPIRY_WARNING_DAYS', '');
    vi.resetModules();
    const mod = await import('@/features/compras/proformas/proformaService');
    expect(mod.DEFAULT_PROFORMA_TAX_RATE_PERCENT).toBe(13);
    expect(mod.PROFORMA_EXPIRY_WARNING_DAYS).toBe(3);
  });

  it('usa el valor de las variables de entorno cuando sí están pobladas', async () => {
    vi.stubEnv('VITE_PROFORMA_TAX_RATE', '8');
    vi.stubEnv('VITE_PROFORMA_EXPIRY_WARNING_DAYS', '5');
    vi.resetModules();
    const mod = await import('@/features/compras/proformas/proformaService');
    expect(mod.DEFAULT_PROFORMA_TAX_RATE_PERCENT).toBe(8);
    expect(mod.PROFORMA_EXPIRY_WARNING_DAYS).toBe(5);
  });
});
