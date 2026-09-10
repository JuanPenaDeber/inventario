import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Tarjeta contenida en vez de pantalla completa. Se usa cuando alrededor
   * sigue habiendo interfaz utilizable —la barra de navegación de App.tsx—
   * para que un error en UN módulo no le tape al usuario la salida hacia los
   * otros siete. Sin esto, el único boundary de toda la app cubría la
   * pantalla entera: un error en Proformas (689 líneas, el módulo más grande
   * sin partir) dejaba Inventario, Préstamos e Incidencias inalcanzables
   * también, aunque no tuvieran nada que ver con el fallo.
   */
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Red de seguridad: si un componente lanza un error de render no controlado,
 * React desmonta el árbol entero de ese boundary hacia abajo y esa parte
 * queda en blanco sin ningún aviso. Esto lo captura y muestra una tarjeta con
 * la opción de recargar, en vez de una pantalla en blanco.
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

  /**
   * En compact, recargar TODA la página contradice lo que la propia tarjeta
   * promete ("podés seguir usando el resto de la app") y le borra el estado
   * sin guardar a los demás módulos, que no tuvieron nada que ver con el
   * error. Ahí alcanza con limpiar el estado de ESTE boundary para reintentar
   * solo ese módulo. El boundary de pantalla completa no tiene "resto de la
   * app" que conservar, así que ahí sí tiene sentido el reload completo.
   */
  handleReload = () => {
    if (this.props.compact) {
      this.setState({ error: null });
      return;
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const card = (
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">
            {this.props.compact ? 'Este módulo no se pudo mostrar' : 'Ocurrió un error inesperado'}
          </h1>
          <p className="text-sm text-slate-500 mb-1">
            {this.props.compact
              ? 'Tus datos en EspoCRM no se ven afectados. Podés seguir usando el resto de la aplicación desde el menú de arriba.'
              : 'La pantalla no se pudo mostrar correctamente. Tus datos en EspoCRM no se ven afectados por esto.'}
          </p>
          <p className="text-xs text-slate-400 font-mono mb-6 break-words">
            {this.state.error.message}
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium"
          >
            <RefreshCw size={16} /> {this.props.compact ? 'Reintentar este módulo' : 'Recargar la página'}
          </button>
        </div>
      );

      if (this.props.compact) {
        // Sin min-h-screen: deja la barra de navegación de App.tsx visible y
        // usable por encima, que es lo que hace que "probar otro módulo"
        // sea una salida real y no solo un texto que lo sugiere.
        return <div className="flex items-center justify-center p-10">{card}</div>;
      }
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">{card}</div>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
