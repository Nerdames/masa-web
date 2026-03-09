"use client";

import Link from "next/link";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function Home() {
  const salesData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        data: [6500, 7800, 9200, 8700, 10500, 11200],
        borderColor: "#FF6B35",
        backgroundColor: "rgba(255,107,53,0.1)",
        tension: 0.3,
        pointRadius: 3,
        fill: true,
      },
    ],
  };

  const salesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { display: false },
      y: { display: false },
    },
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 md:px-16 py-10">
      <div className="grid w-full max-w-7xl md:grid-cols-2 gap-10 lg:gap-16 items-center">

        {/* LEFT SIDE: Hero + CTA */}
        <div className="space-y-6 max-w-lg">

          <div className="flex items-center gap-3">
            <span className="text-4xl md:text-5xl font-extrabold text-green-700">
              MASA
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold leading-tight">
            Run your business from one simple system
          </h1>

          <p className="text-gray-600 text-lg">
            Manage sales, inventory, and customers all in one powerful dashboard.
          </p>

          <Link
            href="/auth/signin"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transition"
          >
            Login to MASA
          </Link>

        </div>

        {/* RIGHT SIDE: Dashboard Preview */}
        <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-2xl p-6">

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">

            <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Sales</p>
                <p className="text-xl font-bold">$12,548</p>
              </div>
              <i className="bx bx-dollar text-2xl text-red-500"></i>
            </div>

            <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Orders</p>
                <p className="text-xl font-bold">584</p>
              </div>
              <i className="bx bx-cart text-2xl text-yellow-500"></i>
            </div>

            <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Customers</p>
                <p className="text-xl font-bold">129</p>
              </div>
              <i className="bx bx-user text-2xl text-teal-500"></i>
            </div>

            <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Avg Order</p>
                <p className="text-xl font-bold">$21.50</p>
              </div>
              <i className="bx bx-line-chart text-2xl text-green-500"></i>
            </div>

          </div>

          {/* Sales Chart */}
          <div className="bg-white border rounded-xl p-4 h-52">

            <div className="flex justify-between mb-3">
              <h2 className="font-semibold text-sm">Sales Overview</h2>
              <span className="text-xs text-orange-500">Month</span>
            </div>

            <div className="h-36">
              <Line data={salesData} options={salesOptions} />
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}