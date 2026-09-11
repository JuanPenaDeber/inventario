import React, { useState } from 'react';
import { Lightbulb, Trash2, Plus } from 'lucide-react';
import { ProductSuggestion } from '@/types';
import {
  getProductSuggestions,
  createProductSuggestion,
  deleteProductSuggestion,
  getSuggestionErrorMessage,
} from '@/features/compras/sugerencias/suggestionService';
import ConfirmDialog, { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { controlClass } from '@/shared/components/ui/Field';
import { ErrorBanner } from '@/shared/components/ui/States';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';

/**
 * Configuración de sugerencias de productos por área y cargo (Fase 4,
 * sección 7 del pedido). suggestions.manage en permissions.ts lo limita a
 * ADMINISTRADOR — antes este comentario documentaba que cualquiera con
 * acceso a Ajustes podía entrar, sin ningún control real; ya no es el caso.
 */
// Clases de campo compartidas (shared/components/ui/Field.tsx). El acento
// amber es el de este módulo.
const inputCls = controlClass('amber') + ' mt-1';

const SuggestionManager: React.FC = () => {
  const { can } = useCurrentUser();
  const canManage = can('suggestions.manage');
  const {
    data: suggestions,
    setData: setSuggestions,
    loading,
    error,
    setError,
  } = useAsyncData<ProductSuggestion[]>(getProductSuggestions, [], {
    errorMessage: 'No se pudieron cargar las sugerencias.',
    getErrorMessage: getSuggestionErrorMessage,
  });

  const [saving, setSaving] = useState(false);
  const [area, setArea] = useState('');
  const [position, setPosition] = useState('');
  const [product, setProduct] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !area.trim() || !position.trim() || !product.trim()) return;
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

  const handleDelete = (id: string) => {
    if (!canManage) return;
    setConfirmState({
      message: '¿Eliminar esta sugerencia?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
      onConfirm: () => doDelete(id),
    });
  };

  const doDelete = async (id: string) => {
    setConfirmState(null);
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

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className={`grid grid-cols-1 gap-8 ${canManage ? 'lg:grid-cols-3' : ''}`}>
        {canManage && (
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-24">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Nueva sugerencia</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Área</label>
                <input type="text" required value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ej: Sistemas" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Cargo</label>
                <input type="text" required value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ej: Desarrollador" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Producto sugerido</label>
                <input type="text" required value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej: Laptop" className={inputCls} />
              </div>
              <button disabled={saving} className="w-full bg-amber-600 disabled:bg-amber-300 text-white py-2 rounded-lg hover:bg-amber-700 flex items-center justify-center gap-2 font-medium">
                <Plus size={18} /> {saving ? 'Guardando...' : 'Agregar sugerencia'}
              </button>
            </form>
          </div>
        </div>
        )}

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
                        {canManage && (
                        <button onClick={() => handleDelete(s.id)} title="Eliminar sugerencia" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </div>
  );
};

export default SuggestionManager;
