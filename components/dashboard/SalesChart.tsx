"use client";

import {
  ChartData,
  ChartOptions,
  TooltipItem,
} from "chart.js";
import { Line } from "react-chartjs-2";

interface SalesChartProps {
  data: ChartData<"line", number[], string>;
  options: ChartOptions<"line">;
}

export default function SalesChart({
  data,
  options,
}: SalesChartProps) {
  return (
    <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-xl shadow h-80">
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Sales Overview</h2>
      </div>

      <div className="h-64">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
