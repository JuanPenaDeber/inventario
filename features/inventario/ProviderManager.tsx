
import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Building2, Mail, Phone, User } from 'lucide-react';
import { Provider } from '../types';
import { getProviders, addProvider, deleteProvider } from '../services/inventoryService';

const ProviderManager: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        const data = await getProviders();
        setProviders(data);
        setLoading(false);
    };
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvider.name) return;
    
    setLoading(true);
    const added = await addProvider(newProvider);
    setProviders(prev => [...prev, added]);
    setNewProvider({ name: '', contactPerson: '', email: '', phone: '' });
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Eliminar proveedor?')) {
        setLoading(true);
        await deleteProvider(id);
        setProviders(prev => prev.filter(p => p.id !== id));
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
            <Building2 size={24} />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Gestion de Proveedores</h1>
            <p className="text-slate-500">Administrar empresas y proveedores de equipos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add Form */}
        <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-24">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Nuevo proveedor</h2>
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">Nombre de la Empresa</label>
                        <input 
                            type="text" 
                            required
                            value={newProvider.name}
                            onChange={e => setNewProvider({...newProvider, name: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">Persona de contacto</label>
                        <input 
                            type="text" 
                            value={newProvider.contactPerson}
                            onChange={e => setNewProvider({...newProvider, contactPerson: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">Email</label>
                        <input 
                            type="email" 
                            value={newProvider.email}
                            onChange={e => setNewProvider({...newProvider, email: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">Teléfono</label>
                        <input 
                            type="tel" 
                            value={newProvider.phone}
                            onChange={e => setNewProvider({...newProvider, phone: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <button disabled={loading} className="w-full bg-purple-600 disabled:bg-purple-300 text-white py-2 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 font-medium">
                        <Plus size={18} /> {loading ? 'Creando...' : 'Guardar Proveedor'}
                    </button>
                </form>
            </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2 grid gap-4">
            {loading && providers.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Cargando proveedores...</div>
            ) : providers.length === 0 ? (
                <div className="bg-slate-50 p-8 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
                    No se ecuentran proveedores registrados.
                </div>
            ) : (
                providers.map(provider => (
                    <div key={provider.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start group hover:border-purple-200 transition-colors">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{provider.name}</h3>
                            <div className="mt-3 space-y-1">
                                {provider.contactPerson && (
                                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                                        <User size={16} className="text-slate-400" /> {provider.contactPerson}
                                    </div>
                                )}
                                {provider.email && (
                                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                                        <Mail size={16} className="text-slate-400" /> {provider.email}
                                    </div>
                                )}
                                {provider.phone && (
                                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                                        <Phone size={16} className="text-slate-400" /> {provider.phone}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={() => handleDelete(provider.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};

export default ProviderManager;
