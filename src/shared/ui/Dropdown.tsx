"use client";

import { FC } from "react";

interface DropdownProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
}

const Dropdown: FC<DropdownProps> = ({ value, options, onChange }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1 w-40 text-sm"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
};

export default Dropdown;