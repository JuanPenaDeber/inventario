// =============================================================================
// Chip de estado.
//
// Los cuatro STATUS_CHIP del proyecto (órdenes, solicitudes, proformas,
// incidencias) mapeaban estado → clases de color y luego repetían, en cada
// sitio de uso, la misma cadena de forma:
//
//   'text-[10px] px-1.5 py-0.5 rounded-full font-bold border'   (en la fila)
//   'text-xs px-2 py-0.5 rounded-full font-bold border'         (en el detalle)
//
// El mapa de colores es propio de cada dominio y se queda en su módulo; lo que
// se comparte es la forma. Así un cambio de forma se hace una vez, y los
// colores siguen donde tiene sentido leerlos.
// =============================================================================

import React from 'react';

export type ChipSize = 'sm' | 'md';

const SHAPE: Record<ChipSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

interface StatusChipProps {
  /** Estado a mostrar. Los guiones bajos se convierten en espacios. */
  status: string;
  /** Clases de color del dominio, del mapa STATUS_CHIP del módulo. */
  tone: string;
  size?: ChipSize;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  tone,
  size = 'sm',
  className = '',
}) => (
  <span
    className={`shrink-0 rounded-full font-bold border whitespace-nowrap ${SHAPE[size]} ${tone} ${className}`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);

export default StatusChip;
