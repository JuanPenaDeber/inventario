
export interface MovementHistory {
  date: string;
  action: 'CREADO' | 'ACTUALIZADO' | 'ASIGNADO' | 'MANTENIMIENTO' | 'RETIRADO' | 'PRESTADO' | 'DESAPARECIDO' | 'DEVUELTO' | 'DEVOLUCION_PARCIAL' | 'DES_ASIGNADO';
  user: string;
  details: string;
}

export interface Provider {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
}

export interface Employee {
  id: string;
  name: string;
  equipo: string;
}

// --- LOAN (PAÑOL) ---
export interface LoanItemDetail {
  itemId: string;
  returned: boolean;
  returnedDate?: string;
}

export interface Loan {
  id: string;
  name: string; // Referencia
  solicitanteId?: string; // Link to employee
  entregadoporId: string; // Responsable
  area: string; 
  solicitante?: string; // Nuevo campo: Solicitante real
  // Items are now fetched async via sub-resource, but we keep this for legacy or if API returns it in list
  equipos?: LoanItemDetail[]; 
  fechaPrestamo: string;
  fechaHoraDevolucion: string; // Legacy/Actual return
  fechaEsperadaDevolucion?: string; // New field requested
  status: 'PRESTADO' | 'DEVUELTO' | 'DEVOLUCION_PARCIAL' | 'FINALIZADO'; 
  notes?: string;
  description?: string;
  responsableId?: string; // Name of employee authorizing the loan (Entregado Por)
}

// --- ASSIGNMENT (ASIGNACIÓN) - Permanent/Long Term ---
export interface Assignment {
  id: string;
  name: string; 
  employeeId?: string; // Link to employee
  employeeName: string;
  equipo: string;
  fecha: string;
  itemIds: string[];
  authorizerId?: string; // Link to employee
  authorizerName: string;
  description?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  serie: string;
  status: string;
  condition: string;
  location: string;
  foto?: string;
  fechaCompra: string;
  precio?: number;
  description?: string;
  providerId?: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  // New field to track individual item return date within a loan context
  fechaDevolucion?: string | null; 
  history: MovementHistory[];
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  ADD_ITEM = 'ADD_ITEM',
  EDIT_ITEM = 'EDIT_ITEM',
  PROVIDERS = 'PROVIDERS',
  LOANS = 'LOANS',             // Pañol
  ASSIGNMENTS = 'ASSIGNMENTS', // Asignaciones
  INCIDENTS = 'INCIDENTS'      // Gestión de Incidencias
}
