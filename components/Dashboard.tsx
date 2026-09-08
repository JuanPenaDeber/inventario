import React, { useMemo, useState } from 'react';
import { Plus, Search, Package, DollarSign, AlertCircle, Filter, ArrowUpDown, UserCheck, CheckCircle } from 'lucide-react';
import { InventoryItem } from '../types';
import { getPhotoUrl } from '../services/photoServer';

interface DashboardProps {
  items: InventoryItem[];
  onAddItem: () => void;
  onEditItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ items, onAddItem, onEditItem, onDeleteItem }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'precio'>('date');

  const filteredItems = useMemo(() => {
    const result = items.filter(item => {
      const matchesSearch = 
        item.name.toLowerCase().includes(search.toLowerCase()) || 
        (item.serie && item.serie.toLowerCase().includes(search.toLowerCase())) ||
        item.category.toLowerCase().includes(search.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(search.toLowerCase());
      
      const matchesFilter = filterStatus === 'All' || item.status === filterStatus;
      return matchesSearch && matchesFilter;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'precio') return (b.precio || 0) - (a.precio || 0);
      // Date desc
      return new Date(b.fechaCompra).getTime() - new Date(a.fechaCompra).getTime();
    });

    return result;
  }, [items, search, filterStatus, sortBy]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      precio: items.reduce((acc, curr) => acc + (Number(curr.precio) || 0), 0),
      assigned: items.reduce((acc, curr) => acc + ((curr.assignedEmployeeId)?1:0), 0),
      unassigned: items.reduce((acc, curr) => acc + ((curr.assignedEmployeeId)?0:1), 0),
      onLoan: items.filter(i => i.status === 'En Prestamo').length,
      others: items.filter(i => i.status === 'En Mantenimiento' || i.status === 'Dado de baja' || i.status === 'Extraviado').length
    };
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                <Package size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">Total Equipos</span>
           </div>
           <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                <DollarSign size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">Total Valor</span>
           </div>
           <p className="text-2xl font-bold text-slate-800">${stats.precio}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <UserCheck size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">Asignados</span>
           </div>
           <p className="text-2xl font-bold text-indigo-600">{stats.assigned}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                <CheckCircle size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">No Asignados</span>
           </div>
           <p className="text-2xl font-bold text-emerald-600">{stats.unassigned}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Package size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">En Prestamo</span>
           </div>
           <p className="text-2xl font-bold text-blue-600">{stats.onLoan}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                <AlertCircle size={20} />
             </div>
             <span className="text-slate-500 text-xs font-medium uppercase">Observados</span>
           </div>
           <p className="text-2xl font-bold text-red-600">{stats.others}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por nombre, categoría, Serie o descripción..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        
        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
            <ArrowUpDown size={16} className="text-slate-400" />
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent outline-none text-sm text-slate-700 cursor-pointer"
            >
              <option value="date">Nuevos primero</option>
              <option value="name">Nombre (A-Z)</option>
              <option value="category">Categoría (A-Z)</option>
            </select>
          </div>

          <div className="relative">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-white border border-slate-200 text-slate-700 pl-10 pr-8 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">Todos</option>
              <option>Activo</option>
              <option>En Mantenimiento</option>
              <option>En Prestamo</option>
              <option>Dado de baja</option>
              <option>Extraviado</option>
            </select>
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          </div>

          <button 
            onClick={onAddItem}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm shadow-blue-500/30 transition-all active:scale-95"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Agregar equipo</span>
          </button>
        </div>
      </div>

      {/* Inventory List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipo</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Serie</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Condición</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No se econtraron equipos con estos criterios.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => onEditItem(item)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                         {item.foto ? (
                            <img src={getPhotoUrl(item.foto, 'pequena')} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Package size={16} />
                            </div>
                          )}
                        </div>
                        <div> 
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      <span className="inline-block bg-slate-100 px-2 py-1 rounded text-xs font-medium text-slate-600">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-mono text-slate-500">{item.serie}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                        ${item.status === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                          item.status === 'En Mantenimiento' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                          item.status === 'En Prestamo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          item.status === 'Extraviado' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                          'bg-red-50 text-red-700 border-red-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'Activo' ? 'bg-emerald-500' : item.status === 'En Mantenimiento' ? 'bg-orange-500' : item.status === 'En Prestamo' ? 'bg-blue-500' : item.status === 'Extraviado' ? 'bg-gray-500' : 'bg-red-500'}`}></span>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">
                      {item.condition}
                    </td>
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => onDeleteItem(item.id)}
                        className="text-slate-400 hover:text-red-600 text-sm font-medium transition-colors px-3 py-1 hover:bg-red-50 rounded"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;