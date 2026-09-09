import React, { useState } from 'react';
import { Wrench, Send, CheckCircle2, X } from 'lucide-react';
import {
  AREAS,
  ARTICULOS,
  CORPORATE_DOMAIN,
  createIncident,
  getErrorMessage,
  type CreateIncidentPayload,
} from '../../services/incidentsService';

const EMPTY: CreateIncidentPayload = {
  usuario: '',
  correo: '',
  area: '',
  articulo: '',
  problema: '',
};

type Errors = Partial<Record<keyof CreateIncidentPayload, string>>;

const inputBase =
  'w-full px-3 py-2 rounded-lg border bg-white text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500';

/** Portal público: intro + formulario para registrar una incidencia de hardware. */
export default function IncidentPortal() {
  const [form, setForm] = useState<CreateIncidentPayload>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleChange =
    (field: keyof CreateIncidentPayload) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const validate = (): boolean => {
    const next: Errors = {};
    if (form.usuario.trim().length < 3)
      next.usuario = 'Ingresa tu nombre completo (mínimo 3 caracteres).';
    if (!form.correo.trim()) next.correo = 'El correo es obligatorio.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo))
      next.correo = 'Ingresa un correo válido.';
    else if (!form.correo.toLowerCase().endsWith(CORPORATE_DOMAIN))
      next.correo = `El correo debe terminar en ${CORPORATE_DOMAIN}.`;
    if (!form.area) next.area = 'Selecciona tu área.';
    if (!form.articulo) next.articulo = 'Selecciona el artículo afectado.';
    if (form.problema.trim().length < 5)
      next.problema = 'Describe el problema con más detalle.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await createIncident({
        ...form,
        usuario: form.usuario.trim(),
        correo: form.correo.trim().toLowerCase(),
        problema: form.problema.trim(),
      });
      setSuccess(
        `Incidencia registrada correctamente. Tu ticket es ${created.ticketId}.`,
      );
      setForm(EMPTY);
      setErrors({});
    } catch (err) {
      setApiError(getErrorMessage(err, 'No se pudo registrar la incidencia.'));
    } finally {
      setSubmitting(false);
    }
  };

  const errorClass = (field: keyof CreateIncidentPayload) =>
    errors[field] ? 'border-red-400' : 'border-slate-300';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Tarjeta de introducción */}
      <div className="bg-white rounded-xl border border-blue-100 p-6 flex gap-4 items-start shadow-sm">
        <div className="text-blue-600 shrink-0 mt-0.5">
          <Wrench size={36} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-1">
            Reporta un problema de hardware
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Si tu computadora, monitor, impresora o cualquier equipo presenta
            una falla, regístrala aquí. El departamento de TI revisará tu
            incidencia y le dará seguimiento. Completa el formulario con la mayor
            cantidad de detalles posible.
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          Registrar incidencia
        </h3>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Usuario */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre del usuario <span className="text-red-500">*</span>
              </label>
              <input
                className={`${inputBase} ${errorClass('usuario')}`}
                value={form.usuario}
                onChange={handleChange('usuario')}
                placeholder="Nombre y apellido"
              />
              {errors.usuario && (
                <p className="text-xs text-red-500 mt-1">{errors.usuario}</p>
              )}
            </div>

            {/* Correo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Correo institucional <span className="text-red-500">*</span>
              </label>
              <input
                className={`${inputBase} ${errorClass('correo')}`}
                value={form.correo}
                onChange={handleChange('correo')}
                placeholder={`usuario${CORPORATE_DOMAIN}`}
              />
              <p
                className={`text-xs mt-1 ${
                  errors.correo ? 'text-red-500' : 'text-slate-400'
                }`}
              >
                {errors.correo ?? `Debe terminar en ${CORPORATE_DOMAIN}`}
              </p>
            </div>

            {/* Área */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Área <span className="text-red-500">*</span>
              </label>
              <select
                className={`${inputBase} ${errorClass('area')}`}
                value={form.area}
                onChange={handleChange('area')}
              >
                <option value="">Selecciona un área…</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {errors.area && (
                <p className="text-xs text-red-500 mt-1">{errors.area}</p>
              )}
            </div>

            {/* Artículo (texto libre con sugerencias) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Artículo <span className="text-red-500">*</span>
              </label>
              <input
                className={`${inputBase} ${errorClass('articulo')}`}
                value={form.articulo}
                onChange={handleChange('articulo')}
                placeholder="Escribe o elige un artículo…"
                list="articulos-sugeridos"
              />
              <datalist id="articulos-sugeridos">
                {ARTICULOS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              {errors.articulo && (
                <p className="text-xs text-red-500 mt-1">{errors.articulo}</p>
              )}
            </div>

            {/* Problema */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Problema <span className="text-red-500">*</span>
              </label>
              <textarea
                className={`${inputBase} ${errorClass('problema')} resize-y`}
                rows={4}
                value={form.problema}
                onChange={handleChange('problema')}
                placeholder="Describe qué ocurre con el equipo o dispositivo."
              />
              <p
                className={`text-xs mt-1 ${
                  errors.problema ? 'text-red-500' : 'text-slate-400'
                }`}
              >
                {errors.problema ??
                  'Describe qué ocurre con el equipo o dispositivo.'}
              </p>
            </div>
          </div>

          {apiError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <X size={18} className="shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Send size={16} />
              )}
              {submitting ? 'Registrando…' : 'Registrar incidencia'}
            </button>
          </div>
        </form>
      </div>

      {/* Toast de éxito */}
      {success && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
            <CheckCircle2 size={18} />
            <span>{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="ml-2 text-white/80 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
