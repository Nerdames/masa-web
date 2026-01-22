"use client";
import { FC } from "react";
import Link from "next/link";

export interface QuickActionProps {
  label: string;
  href: string;
  active?: boolean;
}

const QuickAction: FC<QuickActionProps> = ({ label, href, active }) => {
  return (
    <Link
      href={href}
      className={`px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 transition flex items-center gap-2 ${
        active ? "bg-gray-200 font-semibold" : ""
      }`}
    >
      <i className="bx bx-right-arrow-alt text-black"></i>
      {label}
    </Link>
  );
};

export default QuickAction;
