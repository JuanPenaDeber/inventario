// =============================================================================
// Tests del actor registrado en el histórico de Solicitudes de Compra.
//
// Regresión real: editar/enviar/cancelar registraba en el histórico el
// nombre del SOLICITANTE de la solicitud, no el de quien realmente hizo la
// acción. Antes eran siempre la misma persona porque solo el propio
// solicitante podía tocar su solicitud; permissions.ts ya deja que
// ADMINISTRADOR edite/envíe/cancele la de cualquiera (roles: ['ADMINISTRADOR']
// sin isOwn), así que confundirlos deja el histórico mintiendo sobre quién
// actuó. No es un smoke test del hook completo — solo cubre esto.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { makeEmployee, makePurchaseRequest } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getPurchaseRequests: vi.fn(),
  getPurchaseRequest: vi.fn(),
  getPurchaseRequestHistory: vi.fn(),
  createPurchaseRequest: vi.fn(),
  updatePurchaseRequest: vi.fn(),
  submitPurchaseRequest: vi.fn(),
  cancelPurchaseRequest: vi.fn(),
  getEmployees: vi.fn(),
}));

vi.mock('@/features/compras/solicitudes/purchaseRequestService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/compras/solicitudes/purchaseRequestService')>();
  return {
    ...actual,
    getPurchaseRequests: mocks.getPurchaseRequests,
    getPurchaseRequest: mocks.getPurchaseRequest,
    getPurchaseRequestHistory: mocks.getPurchaseRequestHistory,
    createPurchaseRequest: mocks.createPurchaseRequest,
    updatePurchaseRequest: mocks.updatePurchaseRequest,
    submitPurchaseRequest: mocks.submitPurchaseRequest,
    cancelPurchaseRequest: mocks.cancelPurchaseRequest,
  };
});

vi.mock('@/shared/api/inventoryService', () => ({
  getEmployees: mocks.getEmployees,
}));

import { usePurchaseRequestManager } from '@/features/compras/solicitudes/usePurchaseRequestManager';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const admin = makeEmployee({ id: 'emp-admin', name: 'Ana Admin', rawRole: 'Administrador' });
const ana = makeEmployee({ id: 'emp-ana', name: 'Ana Rojas' }); // solicitante original, no CONSULTA para no confundir con el actor

const solicitudDeAna = makePurchaseRequest({
  id: 'pr-1',
  code: 'SC-2025-001',
  requesterId: 'emp-ana',
  requesterName: 'Ana Rojas',
  status: 'BORRADOR',
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CurrentUserProvider>{children}</CurrentUserProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem('app.currentEmployeeId', 'emp-admin');
  mocks.getEmployees.mockResolvedValue([admin, ana]);
  mocks.getPurchaseRequests.mockResolvedValue([solicitudDeAna]);
  mocks.updatePurchaseRequest.mockResolvedValue(solicitudDeAna);
  mocks.submitPurchaseRequest.mockResolvedValue(solicitudDeAna);
  mocks.cancelPurchaseRequest.mockResolvedValue(solicitudDeAna);
  mocks.createPurchaseRequest.mockResolvedValue({ ...solicitudDeAna, id: 'pr-nueva' });
});

describe('usePurchaseRequestManager — actor del histórico', () => {
  it('ADMINISTRADOR editando la solicitud de otra persona: el actor es el administrador, no el solicitante', async () => {
    const { result } = renderHook(
      () => usePurchaseRequestManager({}),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSaveRequest({
        id: 'pr-1',
        requestDate: '2025-01-01',
        requesterId: 'emp-ana',
        area: 'Redacción',
        position: 'Editora',
        supervisorId: 'emp-ana',
        reason: 'Reposición',
        lines: [],
        submitForApproval: false,
      });
    });

    expect(mocks.updatePurchaseRequest).toHaveBeenCalledWith(
      'pr-1',
      expect.any(Object),
      'Ana Admin',
    );
  });

  it('ADMINISTRADOR cancelando la solicitud de otra persona: el actor es el administrador', async () => {
    const { result } = renderHook(
      () => usePurchaseRequestManager({}),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleCancelRequest(solicitudDeAna);
    });
    await act(async () => {
      await result.current.confirmState?.onConfirm();
    });

    expect(mocks.cancelPurchaseRequest).toHaveBeenCalledWith('pr-1', 'Ana Admin');
  });

  it('ADMINISTRADOR enviando a aprobación la solicitud de otra persona: el actor es el administrador', async () => {
    const { result } = renderHook(
      () => usePurchaseRequestManager({}),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSubmitForApproval(solicitudDeAna);
    });

    expect(mocks.submitPurchaseRequest).toHaveBeenCalledWith('pr-1', 'Ana Admin');
  });

  it('crear una solicitud nueva: el actor es quien la crea, no el solicitante elegido', async () => {
    const { result } = renderHook(
      () => usePurchaseRequestManager({}),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSaveRequest({
        requestDate: '2025-01-01',
        requesterId: 'emp-ana', // el administrador crea EN NOMBRE de Ana
        area: 'Redacción',
        position: 'Editora',
        supervisorId: 'emp-ana',
        reason: 'Reposición',
        lines: [],
        submitForApproval: false,
      });
    });

    expect(mocks.createPurchaseRequest).toHaveBeenCalledWith(expect.any(Object), 'Ana Admin');
  });
});

describe('usePurchaseRequestManager — loadingDetail tras deseleccionar', () => {
  it('no queda en loadingDetail=true si se deselecciona antes de que responda la carga', async () => {
    // Regresión real: el efecto de detalle no reseteaba loadingDetail en la
    // rama de "nada seleccionado" — si la carga anterior seguía en vuelo
    // cuando se deseleccionaba, ese efecto se cancelaba y su `finally` ya no
    // llegaba a apagar el flag (guardado por `cancelled`), dejando el
    // indicador de carga encendido para siempre.
    let resolveDetail: (v: typeof solicitudDeAna) => void;
    const pendingDetail = new Promise<typeof solicitudDeAna>((resolve) => {
      resolveDetail = resolve;
    });
    mocks.getPurchaseRequest.mockReturnValue(pendingDetail);
    mocks.getPurchaseRequestHistory.mockResolvedValue([]);

    const { result } = renderHook(() => usePurchaseRequestManager({}), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedRequestId('pr-1'));
    await waitFor(() => expect(result.current.loadingDetail).toBe(true));

    act(() => result.current.setSelectedRequestId(null)); // deselecciona antes de que 'pr-1' responda

    await waitFor(() => expect(result.current.loadingDetail).toBe(false));

    // La respuesta tardía de la carga cancelada no debería reabrir el detalle.
    resolveDetail!(solicitudDeAna);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selectedRequest).toBeNull();
  });
});
