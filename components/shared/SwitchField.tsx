"use client";

import { useId } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

export interface SwitchFieldProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  description?: string;
  tooltip?: string; // new prop for extra guidance
}

export function SwitchField({
  label,
  checked,
  onChange,
  disabled = false,
  description,
  tooltip,
}: SwitchFieldProps) {
  const id = useId();

  return (
    <Tooltip.Provider>
      <div className="flex flex-col gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <label
              htmlFor={id}
              className="text-sm font-medium text-gray-700 flex items-center gap-1 cursor-pointer"
            >
              {label}
              {tooltip && (
                <span className="text-gray-400 text-xs">ℹ️</span> // small info icon
              )}
            </label>
          </Tooltip.Trigger>

          {tooltip && (
            <Tooltip.Content
              side="top"
              align="center"
              className="px-2 py-1 rounded bg-gray-700 text-white text-xs shadow-md"
            >
              {tooltip}
              <Tooltip.Arrow className="fill-gray-700" />
            </Tooltip.Content>
          )}
        </Tooltip.Root>

        {description && <span className="text-xs text-gray-500">{description}</span>}

        <div className="relative inline-block w-12 h-6 mt-1">
          <input
            type="checkbox"
            id={id}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="peer absolute w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className={`
              w-full h-full rounded-full transition-colors duration-200
              ${checked ? "bg-blue-600" : "bg-gray-300"}
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          />
          <div
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md
              transform transition-transform duration-200
              ${checked ? "translate-x-6" : "translate-x-0"}
            `}
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
}
