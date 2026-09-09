import { describe, it, expect } from 'vitest';
import { isValidStatusTransition } from '@/features/compras/solicitudes/purchaseRequestService';

// El flujo de una solicitud tiene 11 estados y es la regla de negocio más
// larga del proyecto: una transición inválida permitiría, por ejemplo,
// generar una orden de compra sin que nadie la haya aprobado.

describe('flujo de estados de una solicitud de compra', () => {
  it('recorre el camino completo esperado', () => {
    const camino = [
      ['BORRADOR', 'PENDIENTE_APROBACION'],
      ['PENDIENTE_APROBACION', 'APROBADA'],
      ['APROBADA', 'EN_COTIZACION'],
      ['EN_COTIZACION', 'COTIZADA'],
      ['COTIZADA', 'EN_EVALUACION'],
      ['EN_EVALUACION', 'APROBADA_PARA_COMPRA'],
      ['APROBADA_PARA_COMPRA', 'ORDEN_GENERADA'],
      ['ORDEN_GENERADA', 'FINALIZADA'],
    ] as const;

    for (const [from, to] of camino) {
      expect(isValidStatusTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it('no permite generar una orden sin pasar por la aprobación', () => {
    expect(isValidStatusTransition('BORRADOR', 'ORDEN_GENERADA')).toBe(false);
    expect(isValidStatusTransition('PENDIENTE_APROBACION', 'ORDEN_GENERADA')).toBe(false);
    expect(isValidStatusTransition('EN_COTIZACION', 'ORDEN_GENERADA')).toBe(false);
  });

  it('no permite saltar de borrador directo a aprobada', () => {
    expect(isValidStatusTransition('BORRADOR', 'APROBADA')).toBe(false);
  });

  it('una solicitud rechazada no vuelve al flujo', () => {
    expect(isValidStatusTransition('RECHAZADA', 'APROBADA')).toBe(false);
    expect(isValidStatusTransition('RECHAZADA', 'EN_COTIZACION')).toBe(false);
  });

  it('finalizada y cancelada son estados terminales', () => {
    expect(isValidStatusTransition('FINALIZADA', 'EN_COTIZACION')).toBe(false);
    expect(isValidStatusTransition('CANCELADA', 'BORRADOR')).toBe(false);
  });

  it('se puede cancelar desde los estados en curso', () => {
    expect(isValidStatusTransition('BORRADOR', 'CANCELADA')).toBe(true);
    expect(isValidStatusTransition('PENDIENTE_APROBACION', 'CANCELADA')).toBe(true);
    expect(isValidStatusTransition('APROBADA', 'CANCELADA')).toBe(true);
  });

  it('permite rechazar solo cuando está pendiente de aprobación', () => {
    expect(isValidStatusTransition('PENDIENTE_APROBACION', 'RECHAZADA')).toBe(true);
    expect(isValidStatusTransition('BORRADOR', 'RECHAZADA')).toBe(false);
    expect(isValidStatusTransition('APROBADA', 'RECHAZADA')).toBe(false);
  });
});
