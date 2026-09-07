
import React, { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Settings, ChevronDown, ClipboardList, UserCheck, Menu, X, Wrench, ShoppingCart, FileText, LayoutDashboard, Lightbulb } from 'lucide-react';
import { InventoryItem, ViewState } from './types';
import { getInventory, addInventoryItem, deleteInventoryItem, updateInventoryItem } from './services/inventoryService';
import Dashboard from './components/Dashboard';
import InventoryForm from './components/InventoryForm';
import ProviderManager from './components/ProviderManager';
import LoanManager from './components/LoanManager';
import AssignmentManager from './components/AssignmentManager';
import IncidentsModule from './components/incidents/IncidentsModule';
import PurchaseOrderManager from './components/PurchaseOrderManager';
import PurchaseRequestManager from './components/PurchaseRequestManager';
import PurchaseDashboard from './components/PurchaseDashboard';
import SuggestionManager from './components/SuggestionManager';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
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

  // Carga inicial y refresco al cambiar de vista.
  // Gracias a la caché del servicio, los cambios de vista se sirven desde
  // memoria (instantáneo). El spinner que bloquea la pantalla solo aparece
  // en la PRIMERA carga; después el contenido se muestra mientras se refresca.
  useEffect(() => {
    const loadItems = async () => {
        if (firstLoad.current) setLoading(true);
        const data = await getInventory();
        setItems(data);
        setLoading(false);
        firstLoad.current = false;
    };
    loadItems();
  }, [view]);

  const handleSaveItem = async (itemData: any) => {
    setLoading(true);
    if (itemData.id) {
        // Update existing
        const updated = await updateInventoryItem(itemData.id, itemData);
        if (updated) {
            setItems(prev => prev.map(i => i.id === itemData.id ? updated : i));
        }
    } else {
        // Add new
        const newItem = await addInventoryItem(itemData);
        setItems(prev => [newItem, ...prev]);
    }
    setLoading(false);
    setView(ViewState.DASHBOARD);
    setEditingItem(undefined);
  };

  const handleDeleteItem = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      await deleteInventoryItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setView(ViewState.EDIT_ITEM);
  };

  const NavButton = ({ target, icon: Icon, label, activeColor }: any) => (
    <button 
      onClick={() => { setView(target); setIsMobileMenuOpen(false); }} 
      className={`text-sm font-medium flex items-center gap-2 transition-colors px-3 py-2 rounded-lg w-full text-left
        ${view === target ? `text-${activeColor}-600 bg-${activeColor}-50` : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
        {loading ? (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        ) : (
            <>
                {view === ViewState.DASHBOARD && (
                    <Dashboard 
                    items={items} 
                    onAddItem={() => { setEditingItem(undefined); setView(ViewState.ADD_ITEM); }}
                    onEditItem={handleEditItem}
                    onDeleteItem={handleDeleteItem}
                    />
                )}

                {(view === ViewState.ADD_ITEM || view === ViewState.EDIT_ITEM) && (
                    <InventoryForm 
                    initialData={editingItem}
                    onSave={handleSaveItem}
                    onCancel={() => { setEditingItem(undefined); setView(ViewState.DASHBOARD); }}
                    />
                )}

                {view === ViewState.PROVIDERS && (
                    <ProviderManager />
                )}

                {view === ViewState.LOANS && (
                    <LoanManager />
                )}

                {view === ViewState.ASSIGNMENTS && (
                    <AssignmentManager />
                )}

                {view === ViewState.INCIDENTS && (
                    <IncidentsModule />
                )}

                {view === ViewState.PURCHASE_ORDERS && (
                    <PurchaseOrderManager
                        initialSearch={purchaseNav.orderReference}
                        onConsumeInitialSearch={() => setPurchaseNav({})}
                    />
                )}

                {view === ViewState.PURCHASE_REQUESTS && (
                    <PurchaseRequestManager
                        initialRequestId={purchaseNav.requestId}
                        onConsumeInitialRequest={() => setPurchaseNav({})}
                        onNavigateToOrder={goToPurchaseOrder}
                    />
                )}

                {view === ViewState.PURCHASE_DASHBOARD && (
                    <PurchaseDashboard onNavigateToRequest={goToPurchaseRequest} />
                )}

                {view === ViewState.PRODUCT_SUGGESTIONS && (
                    <SuggestionManager />
                )}
            </>
        )}
        </main>
    </div>
  );
};

export default App;
