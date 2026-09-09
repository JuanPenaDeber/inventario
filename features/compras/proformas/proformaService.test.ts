import { describe, it, expect } from 'vitest';
import {
  calculateProformaLineSubtotal,
  calculateProformaTotals,
  calculateExpiryDate,
  getProformaValidity,
} from '@/features/compras/proformas/proformaService';

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
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const enUnAnio = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    expect(getProformaValidity(ayer)).toBe('VENCIDA');
    expect(getProformaValidity(enUnAnio)).toBe('VIGENTE');
  });

  it('avisa cuando faltan pocos días (PROXIMA_A_VENCER)', () => {
    const enDosDias = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(getProformaValidity(enDosDias, 3)).toBe('PROXIMA_A_VENCER');
  });

  it('el último día de validez todavía cuenta como no vencida', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    expect(getProformaValidity(hoy, 3)).toBe('PROXIMA_A_VENCER');
  });
});
