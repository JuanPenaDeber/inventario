// =============================================================================
// Módulo de Asignaciones: entrega permanente de equipos a un empleado.
//
// Este archivo es solo el orquestador — decide qué pantalla se ve y conecta las
// piezas. Lo demás vive donde corresponde:
//
//   useAssignmentManager.ts        estado, llamadas al servidor y acciones
//   components/AssignmentForm      formulario + selector de equipos
//   components/AssignmentDetail    panel derecho del maestro-detalle
//   components/AssignmentPrintDoc  el acta que sale por impresora
// =============================================================================

import React from 'react';
import { UserCheck, ArrowLeft, Plus, FileBadge } from 'lucide-react';
import DateRangeBar from '@/shared/components/DateRangeBar';
import MasterDetail from '@/shared/components/MasterDetail';
import { NoSelection, ErrorBanner } from '@/shared/components/ui/States';
import { useAssignmentManager } from '@/features/asignaciones/useAssignmentManager';
import AssignmentForm from '@/features/asignaciones/components/AssignmentForm';
import AssignmentDetail from '@/features/asignaciones/components/AssignmentDetail';
import AssignmentPrintDoc from '@/features/asignaciones/components/AssignmentPrintDoc';

const AssignmentManager: React.FC = () => {
  const m = useAssignmentManager();

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {m.selectedAssignment && (
        <AssignmentPrintDoc
          assignment={m.selectedAssignment}
          items={m.currentAssignmentItems}
        />
      )}

      <div className="flex justify-between items-center mb-6 shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <UserCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Asignaciones</h1>
            <p className="text-slate-500 text-sm">Gestión de entrega permanente de equipos.</p>
          </div>
        </div>

        <div className="flex gap-3">
          {m.viewMode === 'form' ? (
            <button
              onClick={() => {
                m.setViewMode('dashboard');
                m.resetForm();
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={18} /> Cancelar
            </button>
          ) : (
            <button
              onClick={() => {
                m.resetForm();
                m.setViewMode('form');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus size={18} /> Nueva Asignación
            </button>
          )}
        </div>
      </div>

      {m.viewMode === 'form' ? (
        <AssignmentForm
          isEditing={m.isEditing}
          employees={m.employees}
          availableItems={m.availableItems}
          name={m.name}
          onNameChange={m.setName}
          employeeId={m.employeeId}
          employeeName={m.employeeName}
          onEmployeeChange={m.handleEmployeeChange}
          equipo={m.equipo}
          onEquipoChange={m.setEquipo}
          authorizerId={m.authorizerId}
          onAuthorizerChange={m.handleAuthorizerChange}
          fecha={m.fecha}
          onFechaChange={m.setFecha}
          description={m.description}
          onDescriptionChange={m.setDescription}
          observacion={m.observacion}
          onObservacionChange={m.setObservacion}
          selectedItemIds={m.selectedItemIds}
          onToggleItem={m.toggleItemSelection}
          itemSearch={m.itemSearch}
          onItemSearchChange={m.setItemSearch}
          saving={m.saving}
          onSubmit={m.handleSubmit}
        />
      ) : (
        <>
          <DateRangeBar
            startDate={m.startDate}
            endDate={m.endDate}
            onChange={(s, e) => {
              m.setStartDate(s);
              m.setEndDate(e);
            }}
            onExport={m.handleExportAssignments}
            shown={m.filteredAssignments.length}
            total={m.assignments.length}
            accent="indigo"
            label="asignaciones"
          />

          <MasterDetail
            items={m.filteredAssignments}
            selectedId={m.selectedAssignmentId}
            onSelect={m.setSelectedAssignmentId}
            accent="indigo"
            loading={m.loading}
            loadingMessage="Cargando..."
            emptyMessage="No hay asignaciones."
            search={m.assignmentSearch}
            onSearchChange={m.setAssignmentSearch}
            searchPlaceholder="Buscar empleado..."
            emptyDetail={<NoSelection icon={FileBadge} message="Seleccione una asignación" />}
            renderRow={(a) => (
              <>
                <h3 className="font-medium text-sm text-slate-800">{a.employeeName}</h3>
                <p className="text-xs text-slate-500">{a.equipo}</p>
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                  <span>{new Date(a.fecha).toLocaleDateString()}</span>
                </div>
              </>
            )}
            renderDetail={(assignment) => (
              <AssignmentDetail
                assignment={assignment}
                items={m.currentAssignmentItems}
                loadingItems={m.loadingItems}
                onEdit={m.handleEditStart}
                onPrint={m.handlePrint}
              />
            )}
          />
        </>
      )}

      {m.saveError && (
        <ErrorBanner
          message={m.saveError}
          onDismiss={() => m.setSaveError(null)}
          className="fixed bottom-6 right-6 z-40 max-w-md shadow-lg"
        />
      )}
    </div>
  );
};

export default AssignmentManager;
