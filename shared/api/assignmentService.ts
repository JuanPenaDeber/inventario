// =============================================================================
// Asignaciones: entrega permanente de equipos a un empleado.
//
// A diferencia de un préstamo, no tiene fecha de devolución: el equipo queda
// bajo custodia hasta que se reasigne. Por eso el detalle compara el empleado
// del equipo con el del acta (ver AssignmentDetail.tsx).
// =============================================================================

import { InventoryItem, Assignment } from '@/types';
import {
    ENDPOINTS,
    apiRequest,
    apiWrite,
    cached,
    fetchAllPages,
    mapApiItemToInventory,
    type ApiResponse,
} from '@/shared/api/inventoryClient';

// --- ASSIGNMENT Logic ---

export const getAssignments = async (): Promise<Assignment[]> => cached('assignments', async () => {
  const list = await fetchAllPages<any>(ENDPOINTS.ASSIGNMENTS);
  if (list) {
      // Map API fields if needed (specifically 'area' to 'equipo' to match UI)
      return list.map((item: any) => ({
          ...item,
          equipo: item.area || item.equipo // Map area back to equipo
      }));
  }
  return [];
});

export const getAssignmentItems = async (assignmentId: string): Promise<InventoryItem[]> => {
    // Note: User requested ENDPOINTS.ASSIGNMENTS + "/" + id + "/items" (now /items)
    const data = await apiRequest<ApiResponse<any>>(`${ENDPOINTS.ASSIGNMENTS}/${assignmentId}/items`);
    
    if (data && Array.isArray(data.list)) {
        return data.list.map(mapApiItemToInventory);
    }
    return [];
};

export const deleteAssignmentItems = async (assignmentId: string): Promise<void> => {
    await apiWrite(`${ENDPOINTS.ASSIGNMENTS}/${assignmentId}/items`, 'DELETE');
};

export const removeAssignmentItems = async (assignmentId: string, itemIds: string[]) => {
    // User spec: {"ids": ["id1", "id2"]}
    const payload = { ids: itemIds };
    await apiWrite(`${ENDPOINTS.ASSIGNMENTS}/${assignmentId}/items`, 'DELETE', payload);
};

export const createAssignmentEquipo = async (itemIds: string[], assignmentId: string) => {
    // The API expects just the list of IDs according to instruction
    const ids = {"ids":itemIds};
    await apiWrite(`${ENDPOINTS.ASSIGNMENTS}/${assignmentId}/items`, 'POST',  ids );
};

export const createAssignment = async (data: any): Promise<Assignment> => {
  const date = new Date().toISOString();
  // Ensure fecha matches DB expectation or just use string
  const fechafina = data.fecha;

  // Map 'equipo' to 'area' for the API payload
  const newAssignment = { 
      ...data, 
      fecha: fechafina, 
      date,
      area: data.equipo // Send area instead of equipo if that's the parameter
  };
  
  // Remove UI specific fields if API is strict (optional)
  delete newAssignment.equipo;
  // FIX: Remove itemIds from header creation payload to avoid backend rejection/confusion
  delete (newAssignment as any).itemIds;
  
  // Los equipos de la asignación se enlazan aparte (createAssignmentEquipo),
  // no aquí, para no competir con esa llamada.
  return apiWrite<Assignment>(ENDPOINTS.ASSIGNMENTS, 'POST', newAssignment);
};

export const updateAssignment = async (id: string, updates: Partial<Assignment> & { itemIds?: string[] }): Promise<Assignment | null> => {
  // 1. Update Header Info
  const fechafina = updates.fecha;
  
  const payload = { ...updates };
  if(fechafina) payload.fecha = fechafina;
  
  // Map equipo update to area
  if(updates.equipo) {
      (payload as any).area = updates.equipo;
      delete payload.equipo;
  }
  
  // Remove itemIds from header payload to avoid confusion
  delete (payload as any).itemIds;

  await apiWrite(`${ENDPOINTS.ASSIGNMENTS}/${id}`, 'PUT', payload);

  // 2. Handle Items Diff (Add vs Remove)
  if (updates.itemIds) {
      // Fetch current items to determine what to add vs remove
      const currentItems = await getAssignmentItems(id);
      const currentIds = currentItems.map(i => i.id);
      const newItemIds = updates.itemIds;

      // Identify removals (Items in current but not in new)
      const idsToRemove = currentIds.filter(cid => !newItemIds.includes(cid));
      
      // Identify additions (Items in new but not in current)
      const idsToAdd = newItemIds.filter(nid => !currentIds.includes(nid));

      // Execute Removals
      if (idsToRemove.length > 0) {
          await removeAssignmentItems(id, idsToRemove);
      }

      // Execute Additions
      if (idsToAdd.length > 0) {
          await createAssignmentEquipo(idsToAdd, id);
      }
  }

  return { id, ...updates } as Assignment;
};

