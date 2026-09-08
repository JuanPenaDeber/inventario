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
