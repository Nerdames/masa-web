"use client";

import React from "react";

interface FilterProps {
  onSearch: (query: string) => void;
  onFilterStatus: (status: string) => void;
}

export default function InventoryFilters({ onSearch, onFilterStatus }: FilterProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 w-full">
      <div className="relative flex-1 group">
        <i className='bx bx-search absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-xl group-focus-within:text-[#4F39F6] transition-colors'></i>
        <input 
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by product name or SKU..." 
          className="w-full pl-14 pr-6 py-4 bg-white rounded-2xl border border-gray-100 focus:border-[#4F39F6] focus:ring-4 focus:ring-[#4F39F6]/5 outline-none transition-all text-sm font-medium shadow-sm"
        />
      </div>
      
      <div className="relative w-full md:w-64">
        <select 
          onChange={(e) => onFilterStatus(e.target.value)}
          className="w-full px-6 py-4 bg-white rounded-2xl border border-gray-100 text-sm font-bold text-gray-500 outline-none focus:border-[#4F39F6] focus:ring-4 focus:ring-[#4F39F6]/5 appearance-none cursor-pointer shadow-sm transition-all"
        >
          <option value="all">All Status</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
        <i className='bx bx-chevron-down absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xl'></i>
      </div>
    </div>
  );
}