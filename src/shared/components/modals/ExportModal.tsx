"use client";

import React, { useState } from "react";
import { X, Download, Check, Square } from "lucide-react";

export interface ExportColumn {
  id: string;
  label: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Callback triggered when user confirms export, returning keys of selected columns */
  onExport: (selectedColumnKeys: string[]) => void;
  /** Dynamic list of columns available for this specific data type */
  columns: ExportColumn[];
  /** Optional initial selections */
  defaultSelected?: string[];
  /** Custom title, e.g., "Export Registry" or "Export Transactions" */
  title?: string;
  /** Custom subtitle/description */
  description?: string;
}

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  columns,
  defaultSelected,
  title = "Export Data",
  description = "Select columns for CSV report",
}: ExportModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    defaultSelected || columns.map((col) => col.id)
  );

  if (!isOpen) return null;

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedColumns(columns.map((c) => c.id));
  const deselectAll = () => setSelectedColumns([]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bulk Selection Controls */}
        <div className="px-6 py-2 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex justify-between shrink-0">
          <button 
            onClick={selectAll}
            className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline uppercase tracking-widest"
          >
            Select All
          </button>
          <button 
            onClick={deselectAll}
            className="text-[10px] font-bold text-slate-500 hover:underline uppercase tracking-widest"
          >
            Deselect All
          </button>
        </div>

        {/* Column List */}
        <div className="p-6 overflow-y-auto custom-scrollbar grid grid-cols-1 gap-2">
          {columns.map((col) => {
            const isSelected = selectedColumns.includes(col.id);
            return (
              <label
                key={col.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50"
                    : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  isSelected 
                    ? "bg-blue-600 border-blue-600 text-white" 
                    : "bg-transparent border-slate-300 dark:border-slate-700"
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={isSelected}
                  onChange={() => toggleColumn(col.id)}
                />
                <span className={`text-sm font-medium ${
                  isSelected ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"
                }`}>
                  {col.label}
                </span>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onExport(selectedColumns);
              onClose();
            }}
            disabled={selectedColumns.length === 0}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}