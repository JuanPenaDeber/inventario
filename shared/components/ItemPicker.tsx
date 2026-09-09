// =============================================================================
// Selector de equipos: buscador + rejilla de tarjetas con casilla.
//
// Estaba duplicado en Préstamos y Asignaciones. Las dos copias solo se
// diferenciaban en el color, el texto del buscador y una insignia: Préstamos
// marca los equipos ya asignados, Asignaciones marca los que están en manos de
// otra persona. Esa insignia es la única parte que sabe de negocio, así que
// entra por `renderBadge` y el resto es de este componente.
//
// `matchesItemSearch` se exporta aparte porque la REGLA DE DISPONIBILIDAD sí
// difiere de verdad entre los dos módulos —Préstamos solo ofrece equipos
// activos o ya incluidos en el préstamo que se edita; Asignaciones ofrece
// todos— y forzar esa diferencia dentro del componente habría metido reglas de
// negocio en shared/. Cada módulo compone: filtro propio + búsqueda común.
// =============================================================================

import React from 'react';
import { Search, Package, CheckCircle } from 'lucide-react';
import { InventoryItem } from '@/types';
import {
  Accent,
  ICON_TINT,
  FOCUS_RING,
  PICKED_CARD,
  UNPICKED_CARD,
  PICKED_CHECK,
} from '@/shared/components/ui/accents';

/**
 * ¿El equipo coincide con lo tecleado? Busca en nombre, número de serie y
 * categoría, sin distinguir mayúsculas. Es la parte de la búsqueda que las dos
 * copias tenían idéntica.
 */
export function matchesItemSearch(item: InventoryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    (!!item.serie && item.serie.toLowerCase().includes(q)) ||
    item.category.toLowerCase().includes(q)
  );
}

interface ItemPickerProps {
  /** Equipos ya filtrados por el módulo (disponibilidad + búsqueda). */
  items: InventoryItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  accent: Accent;

  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  title?: string;
  /** Insignia opcional junto a los datos del equipo. Devolver null para ninguna. */
  renderBadge?: (item: InventoryItem) => React.ReactNode;
  /** Texto cuando el filtro no deja ningún equipo. */
  emptyMessage?: string;
  className?: string;
}

export const ItemPicker: React.FC<ItemPickerProps> = ({
  items,
  selectedIds,
  onToggle,
  accent,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar por nombre, categoría o código...',
  title = 'Seleccionar Equipos',
  renderBadge,
  emptyMessage = 'No hay equipos que coincidan con la búsqueda.',
  className = '',
}) => (
  <div
    className={`h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}
  >
    <div className="p-4 border-b border-slate-200 bg-slate-50/50">
      <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Package size={20} className={ICON_TINT[accent]} /> {title}
      </h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 ${FOCUS_RING[accent]}`}
        />
      </div>
    </div>

    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all ${
                  isSelected ? PICKED_CARD[accent] : UNPICKED_CARD[accent]
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? PICKED_CHECK[accent] : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <CheckCircle size={14} />}
                </div>

                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{item.name}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="truncate">{item.serie}</span>
                    <span className="truncate">{item.category}</span>
                    {renderBadge?.(item)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default ItemPicker;
