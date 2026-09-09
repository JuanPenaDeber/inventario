// =============================================================================
// Selección múltiple de equipos.
//
// `toggleItemSelection` estaba escrito carácter por carácter igual en
// LoanManager y AssignmentManager: copiar el Set, mirar si ya está, quitarlo o
// agregarlo, y volver a guardarlo. Un Set nuevo cada vez porque React compara
// por identidad y mutar el existente no vuelve a dibujar.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';

export interface ItemSelection {
  selectedIds: Set<string>;
  /** Agrega el id si falta, lo quita si está. */
  toggle: (id: string) => void;
  /** Reemplaza la selección entera (al abrir un registro para editar). */
  replace: (ids: Iterable<string>) => void;
  /** Vacía la selección (al cancelar o guardar un formulario). */
  clear: () => void;
  has: (id: string) => boolean;
  count: number;
}

export function useItemSelection(inicial: Iterable<string> = []): ItemSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(inicial));

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const replace = useCallback((ids: Iterable<string>) => setSelectedIds(new Set(ids)), []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const has = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return useMemo(
    () => ({ selectedIds, toggle, replace, clear, has, count: selectedIds.size }),
    [selectedIds, toggle, replace, clear, has],
  );
}
