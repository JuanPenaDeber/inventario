// =============================================================================
// Layout maestro-detalle: lista a la izquierda, detalle a la derecha.
//
// Estaba escrito cuatro veces —Préstamos, Asignaciones, Órdenes de Compra y
// Solicitudes de Compra— y comparadas línea a línea las cuatro copias solo se
// diferenciaban en tres cosas: el color del acento, el texto de los mensajes, y
// qué se dibuja dentro de cada fila y del panel de detalle. El resto (la
// rejilla 1/3–2/3, el buscador, los estados de carga y vacío, el resaltado de
// la fila seleccionada con su barra lateral) era idéntico.
//
// Lo que este componente posee es la ESTRUCTURA y la SELECCIÓN. Lo que dibuja
// cada fila y cada detalle sigue siendo del módulo, vía `renderRow` y
// `renderDetail` — porque eso sí es distinto en cada dominio y forzarlo a un
// molde común habría exigido props condicionales hasta volverlo ilegible.
//
// Genérico en `<T extends { id: string }>`: vive en shared/ y no conoce ningún
// tipo de negocio, solo que las cosas de una lista tienen id.
// =============================================================================

import React from 'react';
import { Search } from 'lucide-react';
import { Accent, SELECTED_ROW, FOCUS_RING } from '@/shared/components/ui/accents';
import { LoadingState, EmptyState } from '@/shared/components/ui/States';

export interface MasterDetailProps<T extends { id: string }> {
  items: T[];
  /** Id del elemento abierto en el panel de detalle, o null si no hay ninguno. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Color del módulo: tiñe el foco del buscador y la fila seleccionada. */
  accent: Accent;

  loading?: boolean;
  /** Texto mientras carga. Cada módulo tiene el suyo ("Cargando órdenes..."). */
  loadingMessage?: string;
  /** Texto cuando la lista quedó vacía. Distinto de un error: no hay datos. */
  emptyMessage: string;

  /**
   * Valor del buscador. Si se omite, no se dibuja la caja de búsqueda — los
   * módulos de Compras filtran desde una barra propia situada más arriba.
   */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Contenido de una fila. El marco (padding, borde, resaltado) lo pone este componente. */
  renderRow: (item: T, isSelected: boolean) => React.ReactNode;
  /** Contenido del panel derecho cuando hay algo seleccionado. */
  renderDetail: (item: T) => React.ReactNode;
  /** Qué mostrar en el panel derecho cuando no hay nada seleccionado. */
  emptyDetail: React.ReactNode;

  /**
   * Ocultar al imprimir. Los módulos con acta imprimible (Préstamos,
   * Asignaciones, Órdenes) esconden esta vista de pantalla y dejan solo el
   * documento. Solicitudes de Compra no tiene documento propio, así que se
   * imprime tal cual: ponerle `no-print` dejaría la hoja en blanco.
   */
  hideOnPrint?: boolean;

  /** Clases extra del contenedor externo, para casos puntuales. */
  className?: string;
}

export function MasterDetail<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  accent,
  loading = false,
  loadingMessage = 'Cargando datos...',
  emptyMessage,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  renderRow,
  renderDetail,
  emptyDetail,
  hideOnPrint = true,
  className = '',
}: MasterDetailProps<T>) {
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const conBuscador = search !== undefined && onSearchChange !== undefined;

  return (
    <div
      className={`flex-1 flex flex-col md:flex-row gap-6 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 ${hideOnPrint ? 'no-print' : ''} ${className}`}
    >
      {/* --- Maestro: la lista --- */}
      <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col">
        {conBuscador && (
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${FOCUS_RING[accent]}`}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <LoadingState message={loadingMessage} />
          ) : items.length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors border-l-4 ${
                    isSelected ? SELECTED_ROW[accent] : 'border-l-transparent'
                  }`}
                >
                  {renderRow(item, isSelected)}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* --- Detalle --- */}
      <div className="w-full md:w-2/3 flex flex-col bg-slate-50/30">
        {selected ? renderDetail(selected) : emptyDetail}
      </div>
    </div>
  );
}

export default MasterDetail;
