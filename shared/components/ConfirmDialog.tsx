import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmDialogState {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  state: ConfirmDialogState | null;
  onCancel: () => void;
  busy?: boolean;
}

/** Modal de confirmación reutilizable — reemplaza window.confirm() en todo el módulo de Compras. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ state, onCancel, busy }) => {
  if (!state) return null;
  const isDanger = state.tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-4 flex items-center gap-3 ${isDanger ? 'bg-rose-600' : 'bg-cyan-600'}`}>
          <div className="p-2 bg-white/20 rounded-lg text-white">
            {isDanger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
          </div>
          <h3 className="text-white font-bold text-lg">{state.title ?? (isDanger ? 'Confirmar acción' : 'Confirmar')}</h3>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-700 whitespace-pre-line">{state.message}</p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={state.onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 text-white rounded-lg font-medium disabled:opacity-50 transition-colors ${
              isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-cyan-600 hover:bg-cyan-700'
            }`}
          >
            {busy ? 'Procesando...' : (state.confirmLabel ?? 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
