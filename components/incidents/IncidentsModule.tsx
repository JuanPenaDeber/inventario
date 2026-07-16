import React, { useState } from 'react';
import { UserRound, ShieldCheck, Lock, LogOut } from 'lucide-react';
import { ADMIN_PASSWORD } from '../../services/incidentsService';
import IncidentPortal from './IncidentPortal';
import IncidentsAdmin from './IncidentsAdmin';

const AUTH_STORAGE_KEY = 'incidencias.admin.auth';

/**
 * Interruptor del módulo de Incidencias.
 *
 *   false → (MODO ACTUAL) Solo el panel administrativo, sin contraseña.
 *           En este proyecto únicamente los administradores consultan y
 *           gestionan el estado de las incidencias.
 *
 *   true  → Portal público (formulario para reportar) + panel administrativo
 *           protegido por contraseña, con pestañas para alternar.
 *
 * El código del portal (IncidentPortal), las pestañas (TabButton) y el login
 * (LoginGate) se conservan ÍNTEGROS a propósito: se van a replicar en el
 * proyecto donde la gente reportará sus incidencias. Para reactivarlos aquí
 * basta con poner esta constante en `true`.
 */
const ENABLE_USER_PORTAL: boolean = false;

type SubView = 'portal' | 'admin';

export default function IncidentsModule() {
  const [subview, setSubview] = useState<SubView>('portal');
  const [authed, setAuthed] = useState<boolean>(
    () => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true',
  );

  const login = (password: string): boolean => {
    const ok = password === ADMIN_PASSWORD;
    if (ok) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      setAuthed(true);
    }
    return ok;
  };

  const logout = () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthed(false);
  };

  // --- MODO ACTUAL: panel administrativo directo, sin contraseña ni pestañas.
  if (!ENABLE_USER_PORTAL) {
    return <IncidentsAdmin />;
  }

  // --- MODO COMPLETO: portal + admin con login (listo para el otro proyecto).
  return (
    <div className="space-y-6">
      {/* Conmutador de sub-vista */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <TabButton
            active={subview === 'portal'}
            onClick={() => setSubview('portal')}
            icon={UserRound}
            label="Reportar incidencia"
          />
          <TabButton
            active={subview === 'admin'}
            onClick={() => setSubview('admin')}
            icon={ShieldCheck}
            label="Panel administrativo"
          />
        </div>

        {subview === 'admin' && authed && (
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        )}
      </div>

      {subview === 'portal' ? (
        <IncidentPortal />
      ) : authed ? (
        <IncidentsAdmin />
      ) : (
        <LoginGate onLogin={login} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// =============================================================================
// Puerta de acceso al panel administrativo (se conserva para el otro proyecto)
// =============================================================================

function LoginGate({ onLogin }: { onLogin: (password: string) => boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onLogin(password);
    if (!ok) {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 rounded-full bg-blue-50 p-3 text-blue-600">
          <Lock size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-800">
          Panel administrativo
        </h2>
        <p className="text-sm text-slate-500">
          Ingresa la contraseña para gestionar las incidencias.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="Contraseña"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
              error ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-500">Contraseña incorrecta.</p>
          )}
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Ingresar
        </button>
      </form>
    </div>
  );
}
