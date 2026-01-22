"use client";

import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export interface ChartDataPayment {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface ChartPaymentsProps {
  data: ChartDataPayment[];
  loading?: boolean;
}

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"];

export default function ChartPayments({ data, loading }: ChartPaymentsProps) {
  const total = data.reduce((sum, p) => sum + p.value, 0);

  return (
    <motion.div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-black">Payment Breakdown</h3>
        <a className="text-blue-600 text-sm hover:underline" href="/dashboard/invoices">View Details →</a>
      </div>

      {loading || data.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No payment data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius={80}
              label={({ name, value }) => `${name}: ${((value / total) * 100).toFixed(1)}%`}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number) => `$${value}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}
