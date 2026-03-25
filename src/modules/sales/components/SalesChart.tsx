"use client";

import { ChartData, ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useState } from "react";

interface SalesChartProps {
  data: ChartData<"line", number[], string>;
  options?: ChartOptions<"line">;
}

const periods = ["Day", "Week", "Month", "Year"] as const;

type Period = (typeof periods)[number];

export default function SalesChart({ data, options }: SalesChartProps) {
  const [activePeriod, setActivePeriod] = useState<Period>("Month");

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y ?? 0;
            return `₦${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => `₦${Number(value).toLocaleString()}`,
        },
      },
    },
    ...options,
  };

  const hasData =
    data?.datasets?.length &&
    data.datasets.some((d) => d.data.length > 0);

  return (
    <div className="col-span-12 lg:col-span-8 bg-white p-4 rounded-xl shadow h-80">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Sales Overview
        </h2>

        <div className="flex gap-2">
          {periods.map((period) => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={`px-3 py-1 text-sm rounded border transition
              ${
                activePeriod === period
                  ? "bg-orange-500 text-white border-orange-500"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 pb-4">
        {hasData ? (
          <Line data={data} options={chartOptions} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No sales data available
          </div>
        )}
      </div>
    </div>
  );
}