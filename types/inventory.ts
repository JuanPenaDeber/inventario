import { MovementHistory } from './common';

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

/**
 * Lo que envía el formulario de inventario al guardar: los campos editables,
 * más el `id` solo cuando se está editando un equipo existente. `history` lo
 * arma el backend, no el formulario.
 */
export type InventoryItemInput = Omit<InventoryItem, 'id' | 'history'> & { id?: string };
