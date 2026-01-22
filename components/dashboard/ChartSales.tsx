"use client";

import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface ChartDataSales {
  day: string;
  sales: number;
}

interface ChartSalesProps {
  data: ChartDataSales[];
  loading?: boolean;
}

export default function ChartSales({ data, loading }: ChartSalesProps) {
  return (
    <motion.div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-black">Weekly Sales Overview</h3>
        <a className="text-blue-600 text-sm hover:underline" href="/dashboard/sales">View Details →</a>
      </div>

      {loading || data.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No sales data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip formatter={(value: number) => `$${value}`} />
            <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}
