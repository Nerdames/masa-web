"use client";

import { FC, ReactNode } from "react";

interface GroupProps {
  children: ReactNode;
  header?: string;
  footer?: string;
}

export const SettingsGroup: FC<GroupProps> = ({ children, header, footer }) => {
  return (
    <div className="w-full space-y-1.5">
      {header && (
        <h3 className="px-4 text-[11px] font-bold text-black/40 uppercase tracking-tight">
          {header}
        </h3>
      )}
      
      <div className="bg-white/50 backdrop-blur-md border border-black/[0.05] rounded-[10px] overflow-hidden shadow-sm shadow-black/5 divide-y divide-black/[0.05]">
        {children}
      </div>

      {footer && (
        <p className="px-4 text-[11px] text-black/40 leading-tight">
          {footer}
        </p>
      )}
    </div>
  );
};