import React from "react";

type PropertyRowProps = {
  icon: string;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
};

export const PropertyRow: React.FC<PropertyRowProps> = ({ icon, label, value, valueClassName = "" }) => {
  const isPrimitive = typeof value === "string" || typeof value === "number" || typeof value === "boolean";

  return (
    <div className="flex items-center text-[13px] group py-1.5 overflow-hidden">
      {/* Label and Icon Section */}
      <div
        className="w-32 shrink-0 flex items-center gap-2 text-slate-400 font-medium whitespace-nowrap overflow-hidden"
        aria-label={label}
        role="group"
      >
        <i
          className={`${icon} text-slate-300 group-hover:text-slate-500 transition-colors w-4 text-center`}
          aria-hidden="true"
        />
        <span className="truncate" title={label}>
          {label}
        </span>
      </div>

      {/* Value Section - do not force a text color so callers can control it (e.g., branch primary = black) */}
      <div className={`flex-1 min-w-0 truncate font-medium ${valueClassName}`} aria-live="polite">
        {isPrimitive ? (
          <span className="truncate block" title={String(value)}>
            {String(value)}
          </span>
        ) : (
          <div className="min-w-0 truncate">{value}</div>
        )}
      </div>
    </div>
  );
};
