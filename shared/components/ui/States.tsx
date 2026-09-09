// =============================================================================
// Estados de carga, lista vacía y "nada seleccionado".
//
// Hoy son <div> sueltos escritos a mano en cada módulo, con textos y espaciados
// que ya no coinciden entre sí ("Cargando datos...", "Cargando...", "Cargando
// órdenes...", "Cargando solicitudes..."). Se conserva el texto de cada módulo
// —es información útil para el usuario— pero no el maquetado.
// =============================================================================

import React from 'react';

interface MessageProps {
  message: string;
  className?: string;
}

/** Carga en curso dentro de un panel o una lista. */
export const LoadingState: React.FC<MessageProps> = ({ message, className = '' }) => (
  <div className={`p-8 text-center text-slate-400 ${className}`}>{message}</div>
);

/** Lista sin resultados. Distinto de un error: no pasó nada malo, no hay datos. */
export const EmptyState: React.FC<MessageProps> = ({ message, className = '' }) => (
  <div className={`p-8 text-center text-slate-400 ${className}`}>{message}</div>
);

interface PlaceholderProps {
  /** Icono de lucide-react que acompaña al mensaje. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  message: string;
}

/**
 * Panel de detalle sin nada seleccionado. Ocupa el alto disponible y centra el
 * mensaje, que es lo que hacían las cuatro copias con clases ligeramente
 * distintas cada una.
 */
export const NoSelection: React.FC<PlaceholderProps> = ({ icon: Icon, message }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
    <Icon size={48} className="opacity-20 mb-4" />
    <p>{message}</p>
  </div>
);

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * Aviso de error en línea. Los cinco llamadores que ganaron manejo de errores
 * en la intervención anterior lo dibujaban cada uno por su cuenta; este es el
 * mismo aspecto, en un solo sitio. No se imprime nunca (`print:hidden`).
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onDismiss,
  onRetry,
  className = '',
}) => (
  <div
    role="alert"
    className={`flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden ${className}`}
  >
    <span>{message}</span>
    <div className="flex items-center gap-3 shrink-0">
      {onRetry && (
        <button onClick={onRetry} className="font-medium hover:text-red-900">
          Reintentar
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Cerrar aviso" className="font-medium">
          ×
        </button>
      )}
    </div>
  </div>
);
