
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LayoutGrid, Settings, ChevronDown, ClipboardList, UserCheck, Menu, X, Wrench, ShoppingCart, FileText, LayoutDashboard, Lightbulb } from 'lucide-react';
import { InventoryItem, InventoryItemInput, ViewState } from '@/types';
import {
  getInventory,
  addInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  getInventoryErrorMessage,
} from '@/shared/api/inventoryService';
import ConfirmDialog, { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import CurrentUserBar from '@/shared/components/CurrentUserBar';
import { ErrorBanner } from '@/shared/components/ui/States';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';

// Cada módulo carga su propio JS solo cuando se visita, en vez de que todos
// (Compras incluido, que es el más pesado) vayan en el bundle inicial de
// cualquiera que solo quiera ver el Dashboard de inventario.
const Dashboard = lazy(() => import('@/features/inventario/Dashboard'));
const InventoryForm = lazy(() => import('@/features/inventario/InventoryForm'));
const ProviderManager = lazy(() => import('@/features/inventario/ProviderManager'));
const LoanManager = lazy(() => import('@/features/prestamos/LoanManager'));
const AssignmentManager = lazy(() => import('@/features/asignaciones/AssignmentManager'));
const IncidentsModule = lazy(() => import('@/features/incidencias/IncidentsModule'));
const PurchaseOrderManager = lazy(() => import('@/features/compras/ordenes/PurchaseOrderManager'));
const PurchaseRequestManager = lazy(() => import('@/features/compras/solicitudes/PurchaseRequestManager'));
const PurchaseDashboard = lazy(() => import('@/features/compras/PurchaseDashboard'));
const SuggestionManager = lazy(() => import('@/features/compras/sugerencias/SuggestionManager'));

// Clases completas por color (no construidas con template literals): el CDN
// de Tailwind que usa este proyecto escanea el DOM ya renderizado, así que
// `text-${activeColor}-600` funciona hoy por casualidad — pero se rompería
// silenciosamente si el proyecto migra a un build real de Tailwind con
// PostCSS (que escanea el código fuente, no el DOM).
const NAV_ACTIVE_COLOR: Record<string, string> = {
  blue: 'text-blue-600 bg-blue-50',
  orange: 'text-orange-600 bg-orange-50',
  indigo: 'text-indigo-600 bg-indigo-50',
  rose: 'text-rose-600 bg-rose-50',
  cyan: 'text-cyan-600 bg-cyan-50',
  teal: 'text-teal-600 bg-teal-50',
  slate: 'text-slate-600 bg-slate-50',
  purple: 'text-purple-600 bg-purple-50',
  amber: 'text-amber-600 bg-amber-50',
};

interface NavButtonProps {
  target: ViewState;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  activeColor: string;
}

const PageSpinner: React.FC = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

// --- Ruteo simple por hash de la URL (sin dependencias nuevas) -------------
// Antes, toda la navegación vivía solo en memoria: recargar la página
// siempre volvía al Dashboard, no se podía compartir/guardar un enlace a una
// pantalla concreta, y el botón atrás del navegador no hacía nada dentro de
// la app. ADD_ITEM/EDIT_ITEM quedan fuera a propósito: dependen de
// `editingItem` (un objeto completo), que no es serializable a una URL.
const ROUTABLE_VIEWS = new Set<string>(
  Object.values(ViewState).filter((v) => v !== ViewState.ADD_ITEM && v !== ViewState.EDIT_ITEM),
);

function getViewFromHash(): ViewState {
  const hash = window.location.hash.replace('#', '');
  return ROUTABLE_VIEWS.has(hash) ? (hash as ViewState) : ViewState.DASHBOARD;
}

const App: React.FC = () => {
  const { can, loadingEmployees, currentEmployeeId } = useCurrentUser();
  // Mientras se resuelve "quién soy" (getEmployees() todavía no respondió)
  // el rol cae a CONSULTA por defecto, aunque sessionStorage ya tenga a
  // alguien con más privilegio elegido — sin esto, un Administrador que
  // recarga la página ve por un instante los botones con gate de rol
  // (Eliminar, Nuevo Empleado) desaparecidos y reaparecer solos apenas
  // termina de cargar. Si no hay nadie elegido no hay nada que esperar: el
  // rol CONSULTA ya es el correcto desde el primer render.
  const resolvingIdentity = loadingEmployees && currentEmployeeId !== '';
  const [view, setView] = useState<ViewState>(() => getViewFromHash());
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const firstLoad = useRef(true);

  // Navegación cruzada entre módulos de compras (Solicitudes <-> Órdenes,
  // Dashboard -> Solicitud). Cada Manager la consume una sola vez al montar
  // y avisa que ya la usó (ver onConsumeInitialSearch/onConsumeInitialRequest)
  // para que una visita posterior por el menú normal no la reaplique.
  const [purchaseNav, setPurchaseNav] = useState<{ orderReference?: string; requestId?: string }>({});
  const goToPurchaseOrder = (reference: string) => {
    setPurchaseNav({ orderReference: reference });
    setView(ViewState.PURCHASE_ORDERS);
  };
  const goToPurchaseRequest = (requestId: string) => {
    setPurchaseNav({ requestId });
    setView(ViewState.PURCHASE_REQUESTS);
  };

  // Refleja la vista actual en la URL (para compartir/recargar sin perderla).
  useEffect(() => {
    if (view === ViewState.ADD_ITEM || view === ViewState.EDIT_ITEM) return;
    if (window.location.hash.replace('#', '') !== view) {
      window.location.hash = view;
    }
  }, [view]);

  // Botón atrás/adelante del navegador.
  useEffect(() => {
    const onHashChange = () => {
      setView(getViewFromHash());
      setEditingItem(undefined);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Carga inicial y refresco al volver al Dashboard.
  // Solo el Dashboard usa `items` (InventoryForm recibe su propio
  // `editingItem`, no la lista completa) — antes este efecto recargaba el
  // inventario en CADA cambio de vista, incluso yendo a Incidencias o
  // Solicitudes de Compra, que no lo necesitan para nada.
  // Gracias a la caché del servicio, volver al Dashboard se sirve desde
  // memoria (instantáneo). El spinner que bloquea la pantalla solo aparece
  // en la PRIMERA carga; después el contenido se muestra mientras se refresca.
  useEffect(() => {
    if (view !== ViewState.DASHBOARD) return;
    const loadItems = async () => {
        if (firstLoad.current) setLoading(true);
        const data = await getInventory();
        setItems(data);
        setLoading(false);
        firstLoad.current = false;
    };
    loadItems();
  }, [view]);

  const handleSaveItem = async (itemData: InventoryItemInput) => {
    // Antes cualquiera podía crear o editar un equipo — no había ningún
    // control. Segunda línea de defensa: Dashboard ya esconde los botones,
    // esto cubre el caso de que se llegue acá de otra forma.
    if (!can(itemData.id ? 'inventory.edit' : 'inventory.create')) {
      setError('No tenés permiso para esta acción. Requiere el rol Sistemas o Administrador.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (itemData.id) {
        const updated = await updateInventoryItem(itemData.id, itemData);
        setItems((prev) => prev.map((i) => (i.id === itemData.id ? updated : i)));
      } else {
        const newItem = await addInventoryItem(itemData);
        setItems((prev) => [newItem, ...prev]);
      }
      setView(ViewState.DASHBOARD);
      setEditingItem(undefined);
    } catch (err) {
      // Sin este catch, un fallo al guardar dejaba `loading` en true para
      // siempre (spinner colgado) y el usuario no veía por qué.
      setError(getInventoryErrorMessage(err, 'No se pudo guardar el equipo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = (id: string) => {
    // Antes cualquiera podía borrar cualquier equipo — no había ningún
    // control (ver la revisión de arquitectura, hallazgo de permisos).
    // Mostrar el diálogo de confirmación para algo que no se va a poder
    // hacer sería peor que no mostrar nada: parece que casi funcionó.
    if (!can('inventory.delete')) {
      setError('No tenés permiso para eliminar equipos. Esta acción requiere el rol Administrador.');
      return;
    }
    const item = items.find((i) => i.id === id);
    setConfirmState({
      message: `¿Eliminar "${item?.name ?? 'este equipo'}"? Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
      onConfirm: () => doDeleteItem(id),
    });
  };

  const doDeleteItem = async (id: string) => {
    setConfirmState(null);
    setError(null);
    try {
      await deleteInventoryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(getInventoryErrorMessage(err, 'No se pudo eliminar el equipo.'));
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setView(ViewState.EDIT_ITEM);
  };

  const NavButton = ({ target, icon: Icon, label, activeColor }: NavButtonProps) => (
    <button
      onClick={() => { setView(target); setIsMobileMenuOpen(false); }}
      className={`text-sm font-medium flex items-center gap-2 transition-colors px-3 py-2 rounded-lg w-full text-left
        ${view === target ? NAV_ACTIVE_COLOR[activeColor] : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        {/* Top Navigation */}
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setView(ViewState.DASHBOARD); setEditingItem(undefined); }}>
                <div className="bg-blue-600 text-white p-2 rounded-lg">
                <LayoutGrid size={20} />
                </div>
                <span className="text-xl font-bold text-slate-800 tracking-tight">Inventario El Deber 2</span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6">
                <button 
                  onClick={() => setView(ViewState.DASHBOARD)} 
                  className={`text-sm font-medium transition-colors h-16 border-b-2 ${view === ViewState.DASHBOARD ? 'text-blue-600 border-blue-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                Dashboard
                </button>

                <button 
                  onClick={() => setView(ViewState.LOANS)} 
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.LOANS ? 'text-orange-600 border-orange-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <ClipboardList size={18} />
                Pañol / Préstamos
                </button>

                <button 
                  onClick={() => setView(ViewState.ASSIGNMENTS)} 
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.ASSIGNMENTS ? 'text-indigo-600 border-indigo-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <UserCheck size={18} />
                Asignaciones
                </button>

                <button
                  onClick={() => setView(ViewState.INCIDENTS)}
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.INCIDENTS ? 'text-rose-600 border-rose-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <Wrench size={18} />
                Incidencias
                </button>

                <button
                  onClick={() => setView(ViewState.PURCHASE_REQUESTS)}
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.PURCHASE_REQUESTS ? 'text-cyan-600 border-cyan-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <FileText size={18} />
                Solicitudes de compra
                </button>

                <button
                  onClick={() => setView(ViewState.PURCHASE_ORDERS)}
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.PURCHASE_ORDERS ? 'text-teal-600 border-teal-600' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <ShoppingCart size={18} />
                Órdenes de compra
                </button>

                <button
                  onClick={() => setView(ViewState.PURCHASE_DASHBOARD)}
                  className={`text-sm font-medium flex items-center gap-1.5 transition-colors h-16 border-b-2 ${view === ViewState.PURCHASE_DASHBOARD ? 'text-slate-800 border-slate-800' : 'text-slate-600 border-transparent hover:text-slate-900'}`}
                >
                <LayoutDashboard size={18} />
                Dashboard de Compras
                </button>

                {/* Settings Dropdown */}
                <div className="relative">
                <button
                    onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                    <Settings size={18} />
                    <ChevronDown size={14} />
                </button>

                {showSettingsMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-top-2">
                        <button
                            onClick={() => { setView(ViewState.PROVIDERS); setShowSettingsMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            Gestionar proveedores
                        </button>
                        <button
                            onClick={() => { setView(ViewState.PRODUCT_SUGGESTIONS); setShowSettingsMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            Gestionar sugerencias
                        </button>
                    </div>
                )}
                </div>

                <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 border-2 border-white shadow-sm"></div>
                </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-600 p-2">
                {isMobileMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
            </div>
        </div>
        
        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 p-4 space-y-2">
             <NavButton target={ViewState.DASHBOARD} icon={LayoutGrid} label="Dashboard" activeColor="blue" />
             <NavButton target={ViewState.LOANS} icon={ClipboardList} label="Pañol / Préstamos" activeColor="orange" />
             <NavButton target={ViewState.ASSIGNMENTS} icon={UserCheck} label="Asignaciones" activeColor="indigo" />
             <NavButton target={ViewState.INCIDENTS} icon={Wrench} label="Incidencias" activeColor="rose" />
             <NavButton target={ViewState.PURCHASE_REQUESTS} icon={FileText} label="Solicitudes de compra" activeColor="cyan" />
             <NavButton target={ViewState.PURCHASE_ORDERS} icon={ShoppingCart} label="Órdenes de compra" activeColor="teal" />
             <NavButton target={ViewState.PURCHASE_DASHBOARD} icon={LayoutDashboard} label="Dashboard de Compras" activeColor="slate" />
             <NavButton target={ViewState.PROVIDERS} icon={Settings} label="Providers / Settings" activeColor="purple" />
             <NavButton target={ViewState.PRODUCT_SUGGESTIONS} icon={Lightbulb} label="Sugerencias" activeColor="amber" />
          </div>
        )}
        </nav>

        {/* Main Content */}
        {/* El spinner de `loading` aplica SOLO al Dashboard (es lo único que
            depende de `items`) — cada otro módulo maneja su propia carga
            internamente, igual que ya hacían Préstamos/Asignaciones/etc. */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
          <CurrentUserBar />
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-6" />
          )}
          {/*
            Cada módulo tiene su propio ErrorBoundary (`compact`, ver el
            componente): un error de render en uno no debe apagar los otros
            siete. Antes solo existía el boundary raíz de index.tsx, que cubre
            la pantalla entera — un fallo en cualquier módulo dejaba a Ana en
            Inventario sin acceso a nada, aunque el problema no tuviera nada
            que ver con Inventario.
          */}
          <Suspense fallback={<PageSpinner />}>
            {resolvingIdentity ? (
              <PageSpinner />
            ) : (
            <>
            {view === ViewState.DASHBOARD && (
                loading ? (
                    <PageSpinner />
                ) : (
                    <ErrorBoundary compact>
                        <Dashboard
                        items={items}
                        onAddItem={() => { setEditingItem(undefined); setView(ViewState.ADD_ITEM); }}
                        onEditItem={handleEditItem}
                        onDeleteItem={handleDeleteItem}
                        />
                    </ErrorBoundary>
                )
            )}

            {(view === ViewState.ADD_ITEM || view === ViewState.EDIT_ITEM) && (
                <ErrorBoundary compact>
                    <InventoryForm
                    initialData={editingItem}
                    onSave={handleSaveItem}
                    onCancel={() => { setEditingItem(undefined); setView(ViewState.DASHBOARD); }}
                    />
                </ErrorBoundary>
            )}

            {view === ViewState.PROVIDERS && (
                <ErrorBoundary compact>
                    <ProviderManager />
                </ErrorBoundary>
            )}

            {view === ViewState.LOANS && (
                <ErrorBoundary compact>
                    <LoanManager />
                </ErrorBoundary>
            )}

            {view === ViewState.ASSIGNMENTS && (
                <ErrorBoundary compact>
                    <AssignmentManager />
                </ErrorBoundary>
            )}

            {view === ViewState.INCIDENTS && (
                <ErrorBoundary compact>
                    <IncidentsModule />
                </ErrorBoundary>
            )}

            {view === ViewState.PURCHASE_ORDERS && (
                <ErrorBoundary compact>
                    <PurchaseOrderManager
                        initialSearch={purchaseNav.orderReference}
                        onConsumeInitialSearch={() => setPurchaseNav({})}
                    />
                </ErrorBoundary>
            )}

            {view === ViewState.PURCHASE_REQUESTS && (
                <ErrorBoundary compact>
                    <PurchaseRequestManager
                        initialRequestId={purchaseNav.requestId}
                        onConsumeInitialRequest={() => setPurchaseNav({})}
                        onNavigateToOrder={goToPurchaseOrder}
                    />
                </ErrorBoundary>
            )}

            {view === ViewState.PURCHASE_DASHBOARD && (
                <ErrorBoundary compact>
                    <PurchaseDashboard onNavigateToRequest={goToPurchaseRequest} />
                </ErrorBoundary>
            )}

            {view === ViewState.PRODUCT_SUGGESTIONS && (
                <ErrorBoundary compact>
                    <SuggestionManager />
                </ErrorBoundary>
            )}
            </>
            )}
          </Suspense>
        </main>

        <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </div>
  );
};

export default App;
