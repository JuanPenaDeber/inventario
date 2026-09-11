import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateLineSubtotal,
  calculateOrderTotals,
  isValidStatusTransition,
} from '@/features/compras/ordenes/purchaseOrderService';

// Se testea el cálculo de importes y el flujo de estados: son las dos piezas
// donde un error no se ve en pantalla pero sí en el dinero o en un pedido que
// avanza sin haber sido aprobado.

describe('cálculo de importes de una orden', () => {
  it('multiplica cantidad por precio unitario', () => {
    expect(calculateLineSubtotal(3, 25.5)).toBe(76.5);
  });

  it('redondea a 2 decimales en vez de arrastrar el error del float', () => {
    // 3 * 0.615 da 1.8449999999999998 en coma flotante.
    expect(calculateLineSubtotal(3, 0.615)).toBe(1.85);
  });

  it('trata cantidad o precio ausentes como 0, sin devolver NaN', () => {
    expect(calculateLineSubtotal(0, 100)).toBe(0);
    expect(calculateLineSubtotal(5, undefined as unknown as number)).toBe(0);
  });

  it('suma las líneas y aplica el impuesto sobre el subtotal', () => {
    const totals = calculateOrderTotals([{ subtotal: 100 }, { subtotal: 50 }], 13);
    expect(totals).toEqual({ subtotal: 150, taxAmount: 19.5, total: 169.5 });
  });

  it('con 0% de impuesto el total es igual al subtotal', () => {
    expect(calculateOrderTotals([{ subtotal: 80 }], 0)).toEqual({
      subtotal: 80,
      taxAmount: 0,
      total: 80,
    });
  });

  it('una orden sin líneas da todo en 0', () => {
    expect(calculateOrderTotals([], 13)).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
});

describe('transiciones de estado de una orden', () => {
  it('permite el flujo normal BORRADOR → SOLICITADA → APROBADA → RECIBIDA', () => {
    expect(isValidStatusTransition('BORRADOR', 'SOLICITADA')).toBe(true);
    expect(isValidStatusTransition('SOLICITADA', 'APROBADA')).toBe(true);
    expect(isValidStatusTransition('APROBADA', 'RECIBIDA')).toBe(true);
  });

  it('no deja saltarse la aprobación', () => {
    expect(isValidStatusTransition('BORRADOR', 'RECIBIDA')).toBe(false);
    expect(isValidStatusTransition('SOLICITADA', 'RECIBIDA')).toBe(false);
  });

  it('no deja retroceder una orden ya recibida', () => {
    expect(isValidStatusTransition('RECIBIDA', 'APROBADA')).toBe(false);
    expect(isValidStatusTransition('RECIBIDA', 'BORRADOR')).toBe(false);
  });

  it('no deja cancelar una orden ya recibida', () => {
    expect(isValidStatusTransition('RECIBIDA', 'CANCELADA')).toBe(false);
  });

  it('permite cancelar mientras la orden no se haya recibido', () => {
    expect(isValidStatusTransition('BORRADOR', 'CANCELADA')).toBe(true);
    expect(isValidStatusTransition('SOLICITADA', 'CANCELADA')).toBe(true);
    expect(isValidStatusTransition('APROBADA', 'CANCELADA')).toBe(true);
  });

  it('una orden cancelada es terminal', () => {
    expect(isValidStatusTransition('CANCELADA', 'BORRADOR')).toBe(false);
    expect(isValidStatusTransition('CANCELADA', 'APROBADA')).toBe(false);
  });
});

describe('DEFAULT_TAX_RATE_PERCENT (variable de entorno)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('cae a 13 si VITE_PURCHASE_ORDER_TAX_RATE existe pero queda vacía', async () => {
    // Regresión real: `Number(env ?? 13)` no cae al default con '' (solo con
    // null/undefined) — Number('') es 0, impuesto 0% en silencio.
    vi.stubEnv('VITE_PURCHASE_ORDER_TAX_RATE', '');
    vi.resetModules();
    const mod = await import('@/features/compras/ordenes/purchaseOrderService');
    expect(mod.DEFAULT_TAX_RATE_PERCENT).toBe(13);
  });

  it('usa el valor de la variable de entorno cuando sí está poblada', async () => {
    vi.stubEnv('VITE_PURCHASE_ORDER_TAX_RATE', '21');
    vi.resetModules();
    const mod = await import('@/features/compras/ordenes/purchaseOrderService');
    expect(mod.DEFAULT_TAX_RATE_PERCENT).toBe(21);
  });
});
