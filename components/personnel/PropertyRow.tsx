import React from "react";

export function PropertyRow({ icon, label, value }: { icon: string, label: string, value: React.ReactNode }) {
  return (
    <div className="flex items-center text-[13px] group py-1.5 overflow-hidden">
      {/* Label and Icon Section */}
      <div 
        className="w-32 shrink-0 flex items-center gap-2 text-slate-400 font-medium whitespace-nowrap overflow-hidden"
        aria-label={label}
      >
        <i 
          className={`${icon} text-slate-300 group-hover:text-slate-500 transition-colors w-4 text-center`} 
          aria-hidden="true" 
        /> 
        <span className="truncate" title={label}>{label}</span>
      </div>

      {/* Value Section */}
      <div className="text-slate-800 flex-1 min-w-0 truncate font-medium">
        {typeof value === "string" ? (
          <span className="truncate block" title={value}>{value}</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}