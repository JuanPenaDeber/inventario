// =============================================================================
// Barra "Quién soy", visible en toda la app (se monta una sola vez en
// App.tsx, arriba de cada módulo).
//
// Reemplaza al selector "Actuando como" que sólo existía dentro de Compras.
// La diferencia con aquel no es sólo que ahora es global: es que ACÁ SÓLO SE
// ELIGE LA PERSONA. El rol ya no es un <select> aparte — se resuelve solo
// (ver CurrentUserContext.tsx) y se muestra de sólo lectura, para que quede
// claro que no es algo que se pueda elegir a conveniencia.
// =============================================================================

import React from 'react';
import { UserCog } from 'lucide-react';
import { ROLE_LABEL } from '@/types';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';

/** Color del chip de rol — sólo visual, no repite las reglas de permissions.ts. */
const ROLE_BADGE_CLASS: Record<string, string> = {
  CONSULTA: 'bg-slate-100 text-slate-600',
  SISTEMAS: 'bg-sky-100 text-sky-700',
  SOLICITANTE: 'bg-slate-100 text-slate-600',
  JEFE: 'bg-emerald-100 text-emerald-700',
  COMPRAS: 'bg-cyan-100 text-cyan-700',
  ADMINISTRADOR: 'bg-violet-100 text-violet-700',
};

export const CurrentUserBar: React.FC = () => {
  const { employees, loadingEmployees, currentEmployeeId, setCurrentEmployeeId, role } =
    useCurrentUser();

  return (
    <div className="mb-4 shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm print:hidden">
      <UserCog size={16} className="text-slate-400" />
      <span className="text-slate-500">Quién soy:</span>
      <select
        value={currentEmployeeId}
        onChange={(e) => setCurrentEmployeeId(e.target.value)}
        disabled={loadingEmployees}
        className="px-2 py-1 border border-slate-200 rounded-md bg-slate-50 text-slate-700 disabled:opacity-60"
      >
        <option value="">Sin elegir</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
      {/*
        El rol NO es un segundo <select>: se resuelve solo a partir de quién
        se eligió arriba (EspoCRM, o la tabla local por nombre — ver
        shared/auth/roleResolution.ts). Mostrarlo de sólo lectura es
        intencional: antes cualquiera podía marcarse JEFE con un clic.
      */}
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASS[role]}`}
        title="El rol se calcula solo — no es elegible."
      >
        {ROLE_LABEL[role]}
      </span>
    </div>
  );
};

export default CurrentUserBar;
