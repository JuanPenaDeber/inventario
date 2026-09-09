// =============================================================================
// NOTA DE ARQUITECTURA — por qué este servicio maneja errores distinto a
// incidentsService.ts / purchaseOrderService.ts / purchaseRequestService.ts /
// proformaService.ts / suggestionService.ts:
//
// Este archivo (Inventario, Préstamos, Asignaciones, Proveedores, Empleados)
// atrapa cualquier fallo de red y devuelve datos de respaldo (MOCK_*) o
// null/valores parciales en vez de lanzar una excepción — es el módulo más
// usado a diario, y una caída momentánea de EspoCRM no debe dejar al usuario
// sin poder ver siquiera el inventario.
//
// Los servicios de Compras (Fase 1-4) hacen lo opuesto a propósito: lanzan el
// error y lo muestran en un banner explícito. Ahí ocultar el fallo sería
// peor — una aprobación, una proforma o una orden de compra que "parece"
// haberse guardado pero en realidad no llegó a EspoCRM es un problema mucho
// más serio que ver un mensaje de error.
//
// Es una diferencia intencional según el costo de cada error, no un
// descuido de consistencia entre archivos.
// =============================================================================

import { InventoryItem, Provider, Loan, Assignment, Employee } from '@/types';
import { ESPOCRM_API_KEY } from '@/shared/api/espoClient';
import { getPhotoUploadUrl } from '@/shared/api/photoServer';

interface ApiResponse<T> {
    list: T[];
    total?: number;
}

// API CONFIGURATION
const API_KEY = ESPOCRM_API_KEY;
const BASE_URL = 'http://local.grupoeldeber.com/api/v1';

const ENDPOINTS = {
    ITEMS: `${BASE_URL}/CEquipo`,
    EMPLOYEES: `${BASE_URL}/CRegistroEmpleados`,
    LOANS: `${BASE_URL}/CPrestamo`,
    ASSIGNMENTS: `${BASE_URL}/CAsignacion`,
    PROVIDERS: `${BASE_URL}/CProveedor`,
    ADJUNTOS: `${BASE_URL}/Attachment`,
    // New Endpoints
    LOAN_RETURN: `${BASE_URL}/prestamoequipo/devolver`,
    LOAN_CONSULT: `${BASE_URL}/prestamoequipo/consultar`
};

const HEADERS = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
};

// --- API TYPES & MAPPING ---

// We accept any structure and map robustly
const mapApiItemToInventory = (apiItem: any): InventoryItem => {
    // 1. Robust ID extraction:
    // Prioritize 'equipoId' which comes from the loan detail endpoint.
    const id = apiItem.equipoId || apiItem.id || apiItem._id || `unknown-${Math.random()}`;

    // 2. Robust Name extraction:
    const name = apiItem.name || apiItem.nombre || 'Sin Nombre';
    
    // 3. Map Return Date
    // The specific endpoint uses 'fechadevolucion' (lowercase) or 'devuelto' (int)
    const fechaDevolucion = apiItem.fechadevolucion || apiItem.fechaDevolucion || apiItem.returnedDate || null;
    
    // 4. Determine Status based on context
    // If 'devuelto' exists (from loan api), use it. Otherwise fallback to item status.
    let status = 'Activo';
    if (apiItem.devuelto !== undefined) {
        status = apiItem.devuelto === 1 ? 'DEVUELTO' : 'PRESTADO';
    } else if (apiItem.status) {
        status = apiItem.status;
    }

    return {
        id: id,
        name: name,
        // Since Loan Detail doesn't return these, we provide safe fallbacks so the UI doesn't crash
        description: apiItem.description || apiItem.descripcion || '',
        serie: apiItem.serie || '', // Empty if not provided
        category: apiItem.category || apiItem.tipo || apiItem.categoria || 'Equipo', 
        status: status,
        condition: apiItem.condition || '',
        location: apiItem.location || '',
        foto: apiItem.foto || undefined,
        fechaCompra: apiItem.fechaCompra || '', 
        precio: apiItem.precio || 0,
        providerId: apiItem.providerId || undefined,
        assignedEmployeeId: apiItem.assignedEmployeeId || undefined,
        assignedEmployeeName: apiItem.assignedEmployeeName || undefined,
        fechaDevolucion: fechaDevolucion, 
        history: []
    };
};

// --- MOCK DATA (FALLBACKS) ---
const MOCK_INVENTORY: InventoryItem[] = [
    {
        id: 'mock-1',
        name: 'Dell Latitude 5420',
        category: 'Electronics',
        serie: 'DELL-001',
        assignedEmployeeId: '1',
        status: 'Activo',
        condition: 'Good',
        location: 'IT Storage',
        fechaCompra: new Date().toISOString(),
        precio: 850,
        history: []
    },
    {
        id: 'mock-2',
        name: 'Canon EOS 90D',
        category: 'Photography',
        serie: 'CAM-045',
        status: 'Activo',
        assignedEmployeeId: '1',
        condition: 'Excellent',
        location: 'Studio B',
        fechaCompra: new Date().toISOString(),
        precio: 1200,
        history: []
    }
];

const MOCK_EMPLOYEES: Employee[] = [
    { id: 'emp-1', name: 'Juan Pérez', equipo: 'IT / Desarrollo' },
    { id: 'emp-2', name: 'María Garcia', equipo: 'Recursos Humanos' },
    { id: 'emp-3', name: 'Carlos Lopez', equipo: 'Operaciones' },
    { id: 'emp-4', name: 'Ana Admin', equipo: 'Administración' }
];

const MOCK_PROVIDERS: Provider[] = [
    { id: 'prov-1', name: 'TechSolutions Inc', contactPerson: 'Mike Ross', email: 'sales@techsol.com', phone: '555-0199' }
];

// HELPER: Generic Fetch Wrapper
/** Error de red o de EspoCRM en una operación de este servicio. */
export class InventoryApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'InventoryApiError';
        this.status = status;
    }
}

/** Mensaje legible para el usuario a partir de un error de escritura. */
export function getInventoryErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof InventoryApiError) {
        if (error.status === 403) return 'Sin permiso para esta operación. Revisa el rol del usuario API en EspoCRM.';
        if (error.status === 404) return 'El registro ya no existe en EspoCRM.';
        return `${fallback} (${error.message})`;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'La operación tardó demasiado y se canceló. Verifica la conexión con EspoCRM.';
    }
    return fallback;
}

/** Petición base: SIEMPRE lanza si algo falla. */
async function rawRequest<T>(url: string, method: string, body?: any): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(url, {
            method,
            headers: HEADERS,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new InventoryApiError(`HTTP ${response.status} en ${url}`, response.status);
        }

        // Toda mutación (POST/PUT/DELETE) invalida la caché para que la próxima
        // lectura traiga datos frescos. Evita mostrar información desactualizada.
        if (method !== 'GET') invalidateCache();

        if (response.status === 204) return {} as T;
        return (await response.json()) as T;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * LECTURA con respaldo: devuelve null si falla, para que quien llame pueda
 * caer a los MOCK_* y no dejar la pantalla vacía. Es una decisión deliberada
 * (ver la nota de arquitectura al inicio del archivo).
 */
async function apiRequest<T>(url: string, method: string = 'GET', body?: any): Promise<T | null> {
    try {
        return await rawRequest<T>(url, method, body);
    } catch {
        console.warn(`Fallo leyendo ${url}. Se usa el respaldo local.`);
        return null;
    }
}

/**
 * ESCRITURA: propaga el error en vez de devolver null.
 *
 * Antes las mutaciones compartían el mismo `apiRequest` que las lecturas, así
 * que un fallo devolvía null y cada función seguía adelante inventando un id
 * local (`local-...`, `prov-...`): la interfaz daba el guardado por bueno
 * aunque EspoCRM nunca hubiera recibido el registro, y el dato se perdía sin
 * que nadie se enterara. Leer con respaldo es defendible; escribir no.
 */
async function apiWrite<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: any): Promise<T> {
    return rawRequest<T>(url, method, body);
}

// --- PAGINACIÓN -------------------------------------------------------------
// EspoCRM devuelve como máximo 200 registros por petición (pedirle más
// responde vacío). Sin paginar, cualquier lista más larga se cortaba EN
// SILENCIO: el inventario mostraba 200 de 429 equipos y el Dashboard decía
// "Total: 200" como si fuera el número real.
const PAGE_SIZE = 200;
// Tope de seguridad: 50 páginas = 10.000 registros. Garantiza que el bucle
// termine aunque el backend devuelva algo inesperado.
const MAX_PAGES = 50;

/**
 * Trae TODAS las páginas de una lista de EspoCRM.
 *
 * Mantiene el contrato de apiRequest: devuelve null si falla la primera
 * página (para que siga funcionando el fallback a los MOCK_*). Si falla una
 * página posterior devuelve lo que alcanzó a traer, avisando por consola —
 * romper aquí dejaría al Dashboard con el spinner colgado, porque App.tsx
 * llama a getInventory() sin try/catch.
 */
async function fetchAllPages<T = any>(baseUrl: string): Promise<T[] | null> {
    const all: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${sep}maxSize=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
        const data = await apiRequest<any>(url);

        if (!data || !Array.isArray(data.list)) {
            if (page === 0) return null;
            console.warn(`Paginación interrumpida en ${baseUrl} (página ${page}). Se devuelven ${all.length} registros parciales.`);
            return all;
        }

        all.push(...data.list);
        if (data.list.length < PAGE_SIZE) break;
        if (typeof data.total === 'number' && all.length >= data.total) break;
    }
    return all;
}

// --- CACHÉ EN MEMORIA -------------------------------------------------------
// Evita re-descargar los mismos datos cada vez que se cambia de pestaña.
// Los datos se sirven al instante desde memoria si son recientes (TTL), y las
// mutaciones invalidan la clave correspondiente para no mostrar datos viejos.

const CACHE_TTL_MS = 60_000; // 60s

type CacheKey = 'inventory' | 'providers' | 'employees' | 'loans' | 'assignments';

interface CacheEntry {
    data?: any;
    ts: number;
    inflight?: Promise<any>;
}

const cache = new Map<CacheKey, CacheEntry>();

// Se incrementa en cada mutación. Sirve para descartar respuestas de lecturas
// que salieron ANTES de la mutación y llegan DESPUÉS (evita cachear datos viejos).
let cacheGeneration = 0;

/**
 * Devuelve datos cacheados si siguen frescos; si no, los pide.
 * Además deduplica llamadas simultáneas (si dos componentes piden lo mismo
 * a la vez, se hace UNA sola petición y ambos esperan la misma promesa).
 */
async function cached<T>(key: CacheKey, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = cache.get(key);

    // 1) Cache hit fresco → respuesta instantánea.
    if (entry?.data !== undefined && now - entry.ts < CACHE_TTL_MS) {
        return entry.data as T;
    }
    // 2) Ya hay una petición en curso → reutilizarla (deduplicación).
    if (entry?.inflight) {
        return entry.inflight as Promise<T>;
    }
    // 3) Pedir de nuevo.
    const gen = cacheGeneration;
    const inflight = fetcher()
        .then((data) => {
            // Si hubo una mutación mientras pedíamos, estos datos ya nacieron
            // viejos: se entregan a quien los pidió, pero NO se cachean.
            if (gen === cacheGeneration) cache.set(key, { data, ts: Date.now() });
            else cache.delete(key);
            return data;
        })
        .catch((err) => {
            cache.delete(key);
            throw err;
        });

    cache.set(key, { ts: now, inflight, data: entry?.data });
    return inflight;
}

/** Invalida claves de la caché (sin argumentos, borra todo). */
export const invalidateCache = (...keys: CacheKey[]): void => {
    cacheGeneration++;
    if (keys.length === 0) cache.clear();
    else keys.forEach((k) => cache.delete(k));
};

// --- IMAGE UPLOAD HELPER ---

function base64ToBlob(base64: string): Blob | null {
    try {
        // Separar el metadata del base64
        const parts = base64.split(';base64,');
        if (parts.length !== 2) return null;
        
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        
        return new Blob([uInt8Array], { type: contentType });
    } catch (error) {
        console.error('Error convirtiendo base64 a Blob:', error);
        return null;
    }
}

export const uploadInventoryImage = async (base64Image: string): Promise<string | null> => {
    const blob = base64ToBlob(base64Image);
    if (!blob) return null;

    const formData = new FormData();
    // Generate a unique filename
    const fileName = `foto_${Date.now()}.jpg`;
    formData.append('imagen', blob, fileName);

    try {
        await fetch(getPhotoUploadUrl(fileName), {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY
                // Content-Type is automatically set to multipart/form-data by fetch when body is FormData
            },
            body: formData
        });
        return fileName;

    } catch (error) {
        console.error("Image upload failed:", error);
        return null;
    }
};

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

  // Add items via sub-resource
  if (loanData.itemIds && loanData.itemIds.length > 0) {
      await createLoanItems(loanData.itemIds, loanId);
      
      // Update item status locally (optional side effect handling)
      const items = await getInventory();
      const updatePromises = loanData.itemIds.map(async (itemId: string) => {
          const item = items.find(i => i.id === itemId);
          if (item) {
              await updateInventoryItem(item.id, { status: 'En Prestamo' });
          }
      });
      await Promise.all(updatePromises);
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
