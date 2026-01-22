"use client";
import { FC, ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: string;
  icon?: string; // optional icon class e.g. "bx-cart"
}

const StatCard: FC<StatCardProps> = ({ label, value, icon }) => {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition flex items-center gap-3">
      {icon && (
        <i className={`bx ${icon} text-3xl text-blue-600 p-2 rounded-full bg-gray-50`}></i>
      )}
      <div>
        <h2 className="text-sm text-gray-600">{label}</h2>
        <p className="text-2xl font-bold text-black mt-1">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;
