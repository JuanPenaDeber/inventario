// =============================================================================
// Catálogo maestro: equipos, proveedores y empleados.
//
// Es lo que ARCHITECTURE.md justifica tener en shared/: nueve archivos de todos
// los módulos lo importan (Compras necesita proveedores y empleados, Préstamos
// y Asignaciones necesitan el inventario). Préstamos y Asignaciones viven en
// sus propios archivos de este mismo directorio.
// =============================================================================

import { InventoryItem, Provider, Employee } from '@/types';
import {
    ENDPOINTS,
    apiWrite,
    cached,
    fetchAllPages,
    mapApiItemToInventory,
    uploadInventoryImage,
    MOCK_INVENTORY,
    MOCK_PROVIDERS,
    MOCK_EMPLOYEES,
} from '@/shared/api/inventoryClient';

// --- Inventory Logic ---

export const getInventory = async (): Promise<InventoryItem[]> => cached('inventory', async () => {
  // Use any to allow robust mapping inside
  const list = await fetchAllPages<any>(ENDPOINTS.ITEMS);
  if (list) {
      return list.map(mapApiItemToInventory);
  }
  return MOCK_INVENTORY;
});

export const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'history'>): Promise<InventoryItem> => {
  
  let finalFotoName = item.foto || null;

  // Upload image if it is base64 (newly captured/selected)
  if (item.foto && item.foto.startsWith('data:')) {
      const uploadedPath = await uploadInventoryImage(item.foto);
      if (uploadedPath) {
          finalFotoName = uploadedPath;
      }
  }

  // Construct payload explicitly mapping empty strings to null for backend
  const newItemPayload = {
      name: item.name,
      description: item.description || null,
      serie: item.serie || null,
      tipo: item.category || null,
      condition: item.condition || null,
      location: item.location || null,
      precio: item.precio || 0,
      foto: finalFotoName,
      providerId: item.providerId || null,
      assignedEmployeeId: item.assignedEmployeeId || null, 
      assignedEmployeeName: item.assignedEmployeeName || null,
      fechaCompra: item.fechaCompra || null,
      deleted: false
  };

  return apiWrite<InventoryItem>(ENDPOINTS.ITEMS, 'POST', newItemPayload);
};

export const updateInventoryItem = async (id: string, updates: Partial<InventoryItem>): Promise<InventoryItem> => {
  // Map updates to API structure
  const apiUpdates: any = { ...updates };
  
  // Handle Image Upload if foto changes to base64
  if (updates.foto && updates.foto.startsWith('data:')) {
      const uploadedPath = await uploadInventoryImage(updates.foto);
      if (uploadedPath) {
          apiUpdates.foto = uploadedPath;
          // Update the local object property too so the UI sees the new path immediately if mocked
          updates.foto = uploadedPath; 
      }
  } else if (updates.foto !== undefined) {
      // If it's just a string update (or clearing it)
      apiUpdates.fotoName = updates.foto;
  }

  // Mapping specific fields
  if (updates.category !== undefined) apiUpdates.tipo = updates.category;
  if (updates.serie !== undefined) apiUpdates.serie = updates.serie;
  if (updates.assignedEmployeeId !== undefined) apiUpdates.assignedEmployeeId = updates.assignedEmployeeId;
  if (updates.assignedEmployeeName !== undefined) apiUpdates.assignedEmployeeName = updates.assignedEmployeeName;

  // Explicitly handle empty strings converting to null
  if (apiUpdates.providerId === '') apiUpdates.providerId = null;
  if (apiUpdates.assignedEmployeeId === '') apiUpdates.assignedEmployeeId = null;
  if (apiUpdates.assignedEmployeeName === '') apiUpdates.assignedEmployeeName = null;
  if (apiUpdates.serie === '') apiUpdates.serie = null;
  if (apiUpdates.description === '') apiUpdates.description = null;
  if (apiUpdates.fotoName === '') apiUpdates.fotoName = null;
  if (apiUpdates.fechaCompra === '') apiUpdates.fechaCompra = null;
  
  return apiWrite<InventoryItem>(`${ENDPOINTS.ITEMS}/${id}`, 'PUT', apiUpdates);
};

export const deleteInventoryItem = async (id: string): Promise<void> => {
  await apiWrite(`${ENDPOINTS.ITEMS}/${id}`, 'DELETE');
};

export const unassignInventoryItem = async (id: string): Promise<InventoryItem | null> => {
  // Send null to clear assignment
  const updates = {
      assignedEmployeeId: null,
      assignedEmployeeName: null
  };

  await apiWrite(`${ENDPOINTS.ITEMS}/${id}`, 'PUT', updates);

  // Refresh
  const items = await getInventory();
  return items.find(i => i.id === id) || null;
};

// --- Provider Logic ---

export const getProviders = async (): Promise<Provider[]> => cached('providers', async () => {
  const list = await fetchAllPages<Provider>(ENDPOINTS.PROVIDERS);
  if (list) {
      return list;
  }
  return MOCK_PROVIDERS;
});

export const addProvider = async (provider: Omit<Provider, 'id'>): Promise<Provider> => {
  return apiWrite<Provider>(ENDPOINTS.PROVIDERS, 'POST', provider);
};

export const deleteProvider = async (id: string): Promise<void> => {
  await apiWrite(`${ENDPOINTS.PROVIDERS}/${id}`, 'DELETE');
};

// --- Employee Logic ---

export const getEmployees = async (): Promise<Employee[]> => cached('employees', async () => {
  const list = await fetchAllPages<any>(ENDPOINTS.EMPLOYEES);
  if (list) {
      // Map API employee structure if different
      return list.map((e: any) => ({
          id: e.id,
          name: e.name || e.nombre || 'Unknown',
          equipo: e.equipo || e.departamento || 'General'
      }));
  }
  return MOCK_EMPLOYEES;
});

export const addEmployee = async (name: string, equipo: string): Promise<Employee> => {
    return apiWrite<Employee>(ENDPOINTS.EMPLOYEES, 'POST', { name, equipo });
};
