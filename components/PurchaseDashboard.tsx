import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  ClipboardCheck,
  AlertTriangle,
  ShoppingCart,
  CheckCheck,
  ArrowRight,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { PurchaseRequest, PurchaseRequestStatus, Proforma } from '../types';
import { getPurchaseRequests, getPurchaseRequestErrorMessage } from '../services/purchaseRequestService';
import { getProformas, getProformaValidity } from '../services/proformaService';
import { formatDate } from '../services/reportUtils';

const CARD_COLOR: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  rose: 'bg-rose-100 text-rose-600',
  blue: 'bg-blue-100 text-blue-600',
  violet: 'bg-violet-100 text-violet-600',
  red: 'bg-red-100 text-red-600',
  teal: 'bg-teal-100 text-teal-600',
  green: 'bg-green-100 text-green-600',
};

interface ExpiringItem {
  request: PurchaseRequest;
  proforma: Proforma;
  validity: 'PROXIMA_A_VENCER' | 'VENCIDA';
}

interface PurchaseDashboardProps {
  /** Si se da, cada fila de "próximas a vencer/vencidas" navega directo a la solicitud. */
  onNavigateToRequest?: (requestId: string) => void;
}

/** Indicadores del flujo de compras completo (sección 11 del pedido original). */
const PurchaseDashboard: React.FC<PurchaseDashboardProps> = ({ onNavigateToRequest }) => {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reqData = await getPurchaseRequests();
      setRequests(reqData);

      // Solo tiene sentido revisar vigencia de proformas en solicitudes que
      // todavía están en etapa de cotización/evaluación.
      const activeStatuses: PurchaseRequestStatus[] = ['EN_COTIZACION', 'COTIZADA', 'EN_EVALUACION'];
      const active = reqData.filter((r) => activeStatuses.includes(r.status));

      // Se piden las proformas de todas las solicitudes activas en paralelo
      // en vez de una por una — con varias solicitudes activas, esto evita
      // sumar sus latencias de red en una cascada secuencial.
      const items: ExpiringItem[] = [];
      const proformasByRequest = await Promise.all(active.map((request) => getProformas(request.id)));
      active.forEach((request, i) => {
        proformasByRequest[i]
          .filter((p) => !p.voided)
          .forEach((proforma) => {
            const validity = getProformaValidity(proforma.expiryDate);
            if (validity === 'PROXIMA_A_VENCER' || validity === 'VENCIDA') {
              items.push({ request, proforma, validity });
            }
          });
      });
      items.sort((a, b) => a.proforma.expiryDate.localeCompare(b.proforma.expiryDate));
      setExpiringItems(items);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo cargar el dashboard.'));
      setRequests([]);
      setExpiringItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const count = (s: PurchaseRequestStatus) => requests.filter((r) => r.status === s).length;
  const generatedOrdersCount = requests.filter((r) => !!r.generatedOrderId).length;
  const expiringCount = expiringItems.filter((i) => i.validity === 'PROXIMA_A_VENCER').length;
  const expiredCount = expiringItems.filter((i) => i.validity === 'VENCIDA').length;

  const cards: { label: string; value: number; color: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { label: 'Pendientes de aprobación', value: count('PENDIENTE_APROBACION'), color: 'amber', icon: Clock },
    { label: 'Aprobadas', value: count('APROBADA'), color: 'emerald', icon: CheckCircle2 },
    { label: 'Rechazadas', value: count('RECHAZADA'), color: 'rose', icon: XCircle },
    { label: 'En cotización', value: count('EN_COTIZACION'), color: 'blue', icon: Building2 },
    { label: 'Pendientes de selección', value: count('COTIZADA') + count('EN_EVALUACION'), color: 'violet', icon: ClipboardCheck },
    { label: 'Proformas próximas a vencer', value: expiringCount, color: 'amber', icon: AlertTriangle },
    { label: 'Proformas vencidas', value: expiredCount, color: 'red', icon: AlertTriangle },
    { label: 'Órdenes de compra generadas', value: generatedOrdersCount, color: 'teal', icon: ShoppingCart },
    { label: 'Finalizadas', value: count('FINALIZADA'), color: 'green', icon: CheckCheck },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
          <LayoutDashboard size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Compras</h1>
          <p className="text-slate-500">Estado general del flujo de solicitudes de compra.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
        </div>
      ) : error ? (
        // Importante: si la carga falló, NO se muestran las tarjetas en 0 —
        // eso parecería "ya se revisó y no hay nada" en vez de "no se pudo
        // saber". Se muestra solo el estado de error, con botón para reintentar.
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <div className="p-3 bg-red-50 text-red-500 rounded-full">
            <WifiOff size={28} />
          </div>
          <p className="text-slate-700 font-medium max-w-md">{error}</p>
          <p className="text-slate-400 text-sm max-w-md">
            Los indicadores no se muestran para evitar confundir "no se pudo conectar" con "no hay datos".
          </p>
          <button
            onClick={load}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium"
          >
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                <div className={`p-3 rounded-xl ${CARD_COLOR[c.color]}`}>
                  <c.icon size={22} />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{c.label}</p>
                  <p className="text-2xl font-bold text-slate-800">{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          {expiringItems.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="px-5 py-3 border-b border-slate-200 text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" /> Proformas próximas a vencer o vencidas
              </h2>
              <div className="divide-y divide-slate-100">
                {expiringItems.map(({ request, proforma, validity }) => (
                  <div key={proforma.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {request.code} · {proforma.providerName || proforma.providerId}
                      </p>
                      <p className="text-xs text-slate-500">
                        Proforma #{proforma.number} · Vence: {formatDate(proforma.expiryDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${validity === 'VENCIDA' ? 'text-red-600 border-red-300 bg-red-50' : 'text-amber-600 border-amber-300 bg-amber-50'}`}>
                        {validity === 'VENCIDA' ? 'VENCIDA' : 'PRÓXIMA A VENCER'}
                      </span>
                      {onNavigateToRequest && (
                        <button
                          onClick={() => onNavigateToRequest(request.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700"
                        >
                          Ver solicitud <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && (
        <p className="text-xs text-slate-400 mt-6">
          Total de solicitudes registradas: {requests.length}.
        </p>
      )}
    </div>
  );
};

export default PurchaseDashboard;
