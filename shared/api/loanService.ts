// =============================================================================
// Préstamos (pañol): salidas temporales de equipos con fecha de devolución.
//
// `updateLoan` y `returnLoanItems` llevan la lógica de diferencias entre los
// equipos que tenía el préstamo y los que quedan: es lo que hace que editar un
// préstamo no borre y recree todas sus relaciones.
// =============================================================================

import { InventoryItem, Loan } from '@/types';
import {
    ENDPOINTS,
    apiRequest,
    apiWrite,
    cached,
    fetchAllPages,
    mapApiItemToInventory,
    PartialWriteError,
} from '@/shared/api/inventoryClient';
import { getInventory, updateInventoryItem } from '@/shared/api/catalogService';

// --- PAÑOL (LOAN) Logic ---

export const getLoans = async (): Promise<Loan[]> => cached('loans', async () => {
  const list = await fetchAllPages<Loan>(ENDPOINTS.LOANS);
  return list ?? [];
});

export const getLoanItems = async (loanId: string): Promise<InventoryItem[]> => {
    // UPDATED: Now uses POST to consult items for a specific loan
    const payload = { prestamoId: loanId };
    const data = await apiRequest<any>(ENDPOINTS.LOAN_CONSULT, 'POST', payload);

    // Handle standard wrapper with 'list'
    if (data && Array.isArray(data.list)) {
        return data.list.map(mapApiItemToInventory);
    }

    // Handle direct array response (Fallback)
    if (Array.isArray(data)) {
        return data.map(mapApiItemToInventory);
    }
    
    return [];
};

export const createLoanItems = async (itemIds: string[], loanId: string) => {
    const ids = {"ids":itemIds};
    await apiWrite(`${ENDPOINTS.LOANS}/${loanId}/equipos`, 'POST', ids);
};

// This is for editing loan structure (removing items from a list), NOT for returns
export const removeLoanItems = async (loanId: string, itemIds: string[]) => {
    const payload = { ids: itemIds };
    await apiWrite(`${ENDPOINTS.LOANS}/${loanId}/equipos`, 'DELETE', payload);
};

export const createLoan = async (loanData: any): Promise<Loan> => {
  // Use provided checkout date or default to now
  const fechaPrestamo = loanData.fechaPrestamo 
    ? new Date(loanData.fechaPrestamo).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  
  // Handle Optional Date (Send null if empty)
  // fechaHoraDevolucion is legacy but still used. fechaEsperadaDevolucion is new.
  const fechaEsperada = loanData.fechaEsperadaDevolucion 
    ? new Date(loanData.fechaEsperadaDevolucion).toISOString().split('T')[0]
    : null;
  const fechaHoraDevolucion = loanData.fechaHoraDevolucion 
    ? new Date(loanData.fechaHoraDevolucion).toISOString().replace('T',' ').split('.')[0]
    : null;

  const newLoanHeader = {
    name: loanData.name,
    solicitanteId: loanData.solicitanteId,
    entregadoporId: loanData.entregadoporId,
    area: loanData.area,
    responsableId: loanData.responsableId, // Entregado Por
    solicitante: loanData.solicitante,   // Solicitante Name (New Field)
    description: loanData.description,
    fechaHoraDevolucion: fechaHoraDevolucion, // Map expected date here for legacy support? Or API requires it?
    fechaEsperadaDevolucion: fechaEsperada, // Explicit new field
    status: loanData.status || 'PRESTADO',
    fechaPrestamo: fechaPrestamo // Send the custom start date
  };

  const savedLoan = await apiWrite<Loan>(ENDPOINTS.LOANS, 'POST', newLoanHeader);
  const loanId = savedLoan.id;

  // El préstamo YA se creó en este punto. Si lo que sigue falla —vincular los
  // equipos o marcarlos 'En Prestamo'— no se deshace (no hay una operación de
  // "deshacer creación" segura contra EspoCRM). Antes, un fallo acá se
  // reportaba como "no se pudo guardar el préstamo", que era falso: el
  // préstamo existía, y el equipo quedaba con status 'Activo' — es decir,
  // prestable de nuevo, a pesar de estar ya prestado en este mismo registro.
  // Ver PartialWriteError en inventoryClient.ts.
  if (loanData.itemIds && loanData.itemIds.length > 0) {
      try {
          await createLoanItems(loanData.itemIds, loanId);

          const items = await getInventory();
          const updatePromises = loanData.itemIds.map(async (itemId: string) => {
              const item = items.find(i => i.id === itemId);
              if (item) {
                  await updateInventoryItem(item.id, { status: 'En Prestamo' });
              }
          });
          await Promise.all(updatePromises);
      } catch (err) {
          throw new PartialWriteError(
              `El préstamo "${loanData.name || loanId}" se registró, pero no se pudo vincular o ` +
              `actualizar el estado de sus equipos (quedaron desincronizados). Verifica manualmente ` +
              `el préstamo ${loanId} y los equipos seleccionados antes de reintentar — podrían ` +
              `figurar como disponibles sin estarlo.`,
              { cause: err },
          );
      }
  }

  return savedLoan;
};

export const updateLoan = async (id: string, updates: Partial<Loan> & { itemIds?: string[] }): Promise<Loan | null> => {
    const payload: any = { ...updates };
    
    // Handle Date Mapping for update
    if (updates.fechaHoraDevolucion !== undefined) {
        payload.fechaHoraDevolucion = updates.fechaHoraDevolucion
            ? new Date(updates.fechaHoraDevolucion).toISOString().replace('T',' ').split('.')[0]
            : null;
    }

    // 1. Update Header
    // Remove itemIds from header payload to avoid backend confusion
    delete payload.itemIds;
    
    await apiWrite(`${ENDPOINTS.LOANS}/${id}`, 'PUT', payload);
    
    // 2. Handle Items Diff (Add vs Remove)
    if (updates.itemIds) {
        // Fetch current items to determine what to add vs remove
        // We use the ID because getLoanItems returns InventoryItems with proper IDs
        const currentItems = await getLoanItems(id);
        const currentIds = currentItems.map(i => i.id);
        const newItemIds = updates.itemIds;

        // Identify removals (Items in current but not in new)
        const idsToRemove = currentIds.filter(cid => !newItemIds.includes(cid));
        
        // Identify additions (Items in new but not in current)
        const idsToAdd = newItemIds.filter(nid => !currentIds.includes(nid));

        // Execute Removals
        if (idsToRemove.length > 0) {
            await removeLoanItems(id, idsToRemove);
        }

        // Execute Additions
        if (idsToAdd.length > 0) {
            await createLoanItems(idsToAdd, id);
        }
    }

    return { id, ...updates } as Loan;
};

export const returnLoanItems = async (loanId: string, itemIdsToReturn: string[]): Promise<void> => {
    // UPDATED: Now calls the specific return endpoint for each item
    // Endpoint expects: { prestamoId: "...", equipoId: "...", devuelto: 1 }
    // NOTE: itemIdsToReturn MUST be the equipment IDs (which we mapped to .id in mapApiItemToInventory)
    
    const promises = itemIdsToReturn.map(itemId => {
        const payload = {
            prestamoId: loanId,
            equipoId: itemId,
            devuelto: 1
        };
        return apiWrite(ENDPOINTS.LOAN_RETURN, 'POST', payload);
    });

    await Promise.all(promises);
};
