// =============================================================================
// Infraestructura compartida por los servicios de inventario, préstamos y
// asignaciones (los tres hablan con las mismas entidades de EspoCRM).
//
// Aquí vive el CONTRATO DE ERRORES propio de este lado de la aplicación, que es
// deliberadamente OPUESTO al de shared/api/espoClient.ts:
//
//   · `apiRequest` (LECTURAS)  atrapa el fallo y devuelve datos de respaldo,
//     porque una pantalla de inventario en blanco es peor que una con datos
//     algo viejos.
//   · `apiWrite`  (ESCRITURAS) SIEMPRE lanza, porque un guardado que "parece"
//     haber funcionado y no llegó a EspoCRM pierde datos en silencio.
//
// Es una diferencia intencional según el costo de cada error, no un descuido de
// consistencia entre archivos. Por eso estos servicios no usan espoFetch.
// =============================================================================


import { InventoryItem, Provider, Employee } from '@/types';
import { ESPOCRM_API_KEY } from '@/shared/api/espoClient';
import { createCache } from '@/shared/api/cache';
import { getPhotoUploadUrl } from '@/shared/api/photoServer';

export interface ApiResponse<T> {
    list: T[];
    total?: number;
}

// API CONFIGURATION
const API_KEY = ESPOCRM_API_KEY;
const BASE_URL = 'http://local.grupoeldeber.com/api/v1';

export const ENDPOINTS = {
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
export const mapApiItemToInventory = (apiItem: any): InventoryItem => {
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
export const MOCK_INVENTORY: InventoryItem[] = [
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

export const MOCK_EMPLOYEES: Employee[] = [
    { id: 'emp-1', name: 'Juan Pérez', equipo: 'IT / Desarrollo' },
    { id: 'emp-2', name: 'María Garcia', equipo: 'Recursos Humanos' },
    { id: 'emp-3', name: 'Carlos Lopez', equipo: 'Operaciones' },
    { id: 'emp-4', name: 'Ana Admin', equipo: 'Administración' }
];

export const MOCK_PROVIDERS: Provider[] = [
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
export async function apiRequest<T>(url: string, method: string = 'GET', body?: any): Promise<T | null> {
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
export async function apiWrite<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: any): Promise<T> {
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
export async function fetchAllPages<T = any>(baseUrl: string): Promise<T[] | null> {
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

// --- CACHÉ EN MEMORIA (shared/api/cache.ts) --------------------------------
// Evita re-descargar los mismos datos al cambiar de pestaña. La implementación
// (TTL + deduplicación + descarte de lecturas obsoletas) vivía aquí y era la
// única completa de las cuatro del proyecto; ahora es compartida y las otras
// tres la heredan. Ver la cabecera de shared/api/cache.ts.

type CacheKey = 'inventory' | 'providers' | 'employees' | 'loans' | 'assignments';

const cache = createCache<CacheKey>();

export const cached = <T>(key: CacheKey, fetcher: () => Promise<T>): Promise<T> =>
    cache.get(key, fetcher);

/** Invalida claves de la caché (sin argumentos, borra todo). */
export const invalidateCache = (...keys: CacheKey[]): void => cache.invalidate(...keys);

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
