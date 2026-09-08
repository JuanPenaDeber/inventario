// --- SUGERENCIAS POR ÁREA Y CARGO (Fase 4) ----------------------------------
// Configurable por el rol ADMINISTRADOR (ver components/SuggestionManager.tsx).
export interface ProductSuggestion {
  id: string;
  area: string;
  position: string; // Cargo
  product: string;
}
