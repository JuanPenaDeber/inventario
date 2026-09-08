import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Red de seguridad para toda la app: si cualquier componente lanza un error
 * de render no controlado, React desmonta el árbol entero y la pantalla
 * queda en blanco sin ningún aviso. Esto captura ese error y muestra una
 * pantalla con la opción de recargar, en vez de una pantalla en blanco.
 *
 * Solo cubre errores de render (los de red/fetch ya se manejan con
 * try/catch en cada servicio) — tiene que ser una clase porque React no
 * tiene un equivalente de componentDidCatch/getDerivedStateFromError para
 * componentes de función todavía.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error no controlado en la interfaz:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-lg font-bold text-slate-800 mb-2">Ocurrió un error inesperado</h1>
            <p className="text-sm text-slate-500 mb-1">
              La pantalla no se pudo mostrar correctamente. Tus datos en EspoCRM no se ven
              afectados por esto.
            </p>
            <p className="text-xs text-slate-400 font-mono mb-6 break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium"
            >
              <RefreshCw size={16} /> Recargar la página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
