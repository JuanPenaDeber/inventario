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
  observacion?: string;
}
