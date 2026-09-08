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
