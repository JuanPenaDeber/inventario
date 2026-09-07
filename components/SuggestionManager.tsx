import React, { useEffect, useState } from 'react';
import { Lightbulb, Trash2, Plus } from 'lucide-react';
import { ProductSuggestion } from '../types';
import {
  getProductSuggestions,
  createProductSuggestion,
  deleteProductSuggestion,
  getSuggestionErrorMessage,
} from '../services/suggestionService';

/**
 * Configuración de sugerencias de productos por área y cargo (Fase 4,
 * sección 7 del pedido). Pensado para el rol ADMINISTRADOR — sin seguridad
 * real, igual que "Gestionar proveedores": cualquiera con acceso a Ajustes
 * puede entrar aquí (ver README.md).
 */
const SuggestionManager: React.FC = () => {
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [area, setArea] = useState('');
  const [position, setPosition] = useState('');
  const [product, setProduct] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSuggestions(await getProductSuggestions());
    } catch (err) {
      setError(getSuggestionErrorMessage(err, 'No se pudieron cargar las sugerencias.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area.trim() || !position.trim() || !product.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createProductSuggestion({ area: area.trim(), position: position.trim(), product: product.trim() });
      setSuggestions((prev) => [...prev, created]);
      setProduct('');
    } catch (err) {
      setError(getSuggestionErrorMessage(err, 'No se pudo guardar la sugerencia.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta sugerencia?')) return;
    try {
      await deleteProductSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(getSuggestionErrorMessage(err, 'No se pudo eliminar la sugerencia.'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
          <Lightbulb size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sugerencias de productos por Área y Cargo</h1>
          <p className="text-slate-500">Se muestran como accesos rápidos al crear una solicitud de compra.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-24">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Nueva sugerencia</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Área</label>
                <input type="text" required value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ej: Sistemas" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Cargo</label>
                <input type="text" required value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ej: Desarrollador" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Producto sugerido</label>
                <input type="text" required value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej: Laptop" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <button disabled={saving} className="w-full bg-amber-600 disabled:bg-amber-300 text-white py-2 rounded-lg hover:bg-amber-700 flex items-center justify-center gap-2 font-medium">
                <Plus size={18} /> {saving ? 'Guardando...' : 'Agregar sugerencia'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando sugerencias...</div>
          ) : suggestions.length === 0 ? (
            <div className="bg-slate-50 p-8 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
              No hay sugerencias configuradas todavía.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-3">Área</th>
                    <th className="px-4 py-3">Cargo</th>
                    <th className="px-4 py-3">Producto sugerido</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suggestions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{s.area}</td>
                      <td className="px-4 py-3">{s.position}</td>
                      <td className="px-4 py-3 font-medium">{s.product}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuggestionManager;
