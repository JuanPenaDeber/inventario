// =============================================================================
// Módulo de Préstamos (pañol): salidas temporales con fecha de devolución.
//
// Orquestador. Lo demás vive donde corresponde:
//
//   useLoanManager.ts          estado, llamadas al servidor y acciones
//   components/LoanForm        formulario + selector de equipos
//   components/LoanDetail      panel derecho + devolución equipo por equipo
//   components/LoanPrintDoc    el comprobante que sale por impresora
// =============================================================================

import React from 'react';
import { ClipboardList, ArrowLeft, Plus } from 'lucide-react';
import DateRangeBar from '@/shared/components/DateRangeBar';
import MasterDetail from '@/shared/components/MasterDetail';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { NoSelection, ErrorBanner } from '@/shared/components/ui/States';
import { useLoanManager } from '@/features/prestamos/useLoanManager';
import LoanForm from '@/features/prestamos/components/LoanForm';
import LoanDetail from '@/features/prestamos/components/LoanDetail';
import LoanPrintDoc from '@/features/prestamos/components/LoanPrintDoc';

const LoanManager: React.FC = () => {
  const m = useLoanManager();

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {m.selectedLoan && (
        <LoanPrintDoc
          loan={m.selectedLoan}
          items={m.currentLoanItems}
          getEmployeeName={m.getEmployeeName}
        />
      )}

      <div className="flex justify-between items-center mb-6 shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
            <ClipboardList size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Pañol / Préstamos</h1>
            <p className="text-slate-500 text-sm">
              Préstamos temporales con fecha de devolución.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          {m.viewMode !== 'dashboard' ? (
            <button
              onClick={() => {
                m.setViewMode('dashboard');
                m.resetForm();
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={18} /> Cancelar
            </button>
          ) : m.canCreateLoan ? (
            <button
              onClick={() => {
                m.resetForm();
                m.setViewMode('create');
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/30"
            >
              <Plus size={18} /> Nuevo Préstamo
            </button>
          ) : null}
        </div>
      </div>

      {m.viewMode !== 'dashboard' ? (
        <LoanForm
          isEditing={m.viewMode === 'edit'}
          employees={m.employees}
          availableItems={m.availableItems}
          name={m.name}
          onNameChange={m.setName}
          fechaPrestamo={m.fechaPrestamo}
          onFechaPrestamoChange={m.setfechaPrestamo}
          solicitanteId={m.solicitanteId}
          onSolicitanteChange={m.handleEmployeeChange}
          onAddQuickEmployee={m.handleAddQuickEmployee}
          canAddEmployee={m.canAddEmployee}
          borrowerContact={m.borrowerContact}
          responsableId={m.responsableId}
          onResponsableChange={m.handleResponsibleChange}
          entregadoporId={m.entregadoporId}
          onEntregadoporChange={m.handleEntregadoporChange}
          fechaEsperadaDevolucion={m.fechaEsperadaDevolucion}
          onFechaEsperadaChange={m.setFechaEsperadaDevolucion}
          fechaHoraDevolucion={m.fechaHoraDevolucion}
          onFechaHoraDevolucionChange={m.setFechaHoraDevolucion}
          observations={m.observations}
          onObservationsChange={m.setObservations}
          selectedItemIds={m.selectedItemIds}
          onToggleItem={m.toggleItemSelection}
          itemSearch={m.itemSearch}
          onItemSearchChange={m.setItemSearch}
          saving={m.saving}
          onSubmit={m.handleSaveLoan}
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
            onExport={m.handleExportLoans}
            shown={m.filteredLoans.length}
            total={m.loans.length}
            accent="orange"
            label="préstamos"
          />

          <MasterDetail
            items={m.filteredLoans}
            selectedId={m.selectedLoanId}
            onSelect={m.setSelectedLoanId}
            accent="orange"
            loading={m.loading}
            loadingMessage="Cargando datos..."
            emptyMessage="No hay préstamos registrados."
            search={m.loanSearch}
            onSearchChange={m.setLoanSearch}
            searchPlaceholder="Buscar préstamo..."
            emptyDetail={
              <NoSelection
                icon={ClipboardList}
                message="Seleccione un préstamo para ver detalles"
              />
            }
            renderRow={(loan, isSelected) => {
              const isReturned =
                loan.status === 'DEVUELTO' ||
                loan.status === 'FINALIZADO' ||
                loan.fechaHoraDevolucion;
              // Activo = todo lo que no fue devuelto explícitamente.
              const isActive = !isReturned;
              const isLoanOverdue =
                isActive && m.isOverdue(loan.fechaEsperadaDevolucion || loan.fechaHoraDevolucion);

              return (
                <>
                  <div className="flex justify-between items-start mb-1">
                    <h3
                      className={`font-medium text-sm ${isSelected ? 'text-orange-900' : 'text-slate-800'}`}
                    >
                      {m.getEmployeeName(loan.solicitanteId)}
                    </h3>
                    {isActive ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          isLoanOverdue
                            ? 'bg-red-100 text-red-600'
                            : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {isLoanOverdue ? 'VENCIDO' : 'ACTIVO'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500">
                        FINALIZADO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-1">{loan.area}</p>
                  <p className="text-[10px] text-slate-400 italic mb-2 truncate">{loan.name}</p>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{new Date(loan.fechaPrestamo).toISOString().split('T')[0]}</span>
                  </div>
                </>
              );
            }}
            renderDetail={(loan) => (
              <LoanDetail
                loan={loan}
                items={m.currentLoanItems}
                loadingItems={m.loadingItems}
                getEmployeeName={m.getEmployeeName}
                itemsToReturn={m.itemsToReturn}
                onToggleReturn={m.toggleReturnSelection}
                onPartialReturn={m.handlePartialReturn}
                saving={m.saving}
                canReturn={m.canReturnLoan}
                onEdit={m.handleEditStart}
                canEdit={m.canEditLoan}
                onPrint={m.handlePrintLoan}
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

      <ConfirmDialog
        state={m.confirmState}
        onCancel={() => m.setConfirmState(null)}
        busy={m.saving}
      />
    </div>
  );
};

export default LoanManager;
