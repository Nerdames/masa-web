"use client";

import { useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sample data (replace with your dynamic data from hooks)
  const salesData = {
    labels: [
      "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
    ],
    datasets: [
      {
        label: "Sales ($)",
        data: [6500, 7800, 9200, 8700, 10500, 11200, 12500, 13100, 11800, 12800, 13500, 12548],
        backgroundColor: "rgba(255, 107, 53, 0.1)",
        borderColor: "#FF6B35",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#FF6B35",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
      },
    ],
  };

  const salesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#293241",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context: any) => `$${context.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#6C757D" } },
      y: {
        beginAtZero: true,
        grid: { color: "#E0E6ED" },
        ticks: {
          color: "#6C757D",
          callback: (value: any) => "$" + value.toLocaleString(),
        },
      },
    },
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
     

        <main className="flex-1 overflow-y-auto p-6">
          {/* Page Title */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-gray-500 mt-1">
                Welcome back, John! Here's what's happening today.
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-gray-500 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold">$12,548</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-500">💰</div>
              </div>
              <p className="text-green-500 text-sm">▲ 12.5% vs last month</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-gray-500 text-sm">Total Orders</p>
                  <p className="text-2xl font-bold">584</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-500">🛒</div>
              </div>
              <p className="text-green-500 text-sm">▲ 8.2% vs last month</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-gray-500 text-sm">New Customers</p>
                  <p className="text-2xl font-bold">129</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center text-teal-500">👥</div>
              </div>
              <p className="text-green-500 text-sm">▲ 5.7% vs last month</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-gray-500 text-sm">Avg. Order Value</p>
                  <p className="text-2xl font-bold">$21.50</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-500">📈</div>
              </div>
              <p className="text-red-500 text-sm">▼ 2.1% vs last month</p>
            </div>
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-12 gap-6">
            {/* Sales Chart */}
            <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-xl shadow h-80">
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-semibold">Sales Overview</h2>
                <div className="flex gap-2">
                  <button className="px-2 py-1 border rounded text-sm">Day</button>
                  <button className="px-2 py-1 border rounded text-sm">Week</button>
                  <button className="px-2 py-1 border rounded text-sm bg-orange-500 text-white">Month</button>
                  <button className="px-2 py-1 border rounded text-sm">Year</button>
                </div>
              </div>
              <div className="h-64">
                <Line data={salesData} options={salesOptions} />
              </div>
            </div>

            {/* Popular Items */}
            <div className="col-span-12 lg:col-span-4 bg-white p-6 rounded-xl shadow">
              <h2 className="text-lg font-semibold mb-4">Popular Items</h2>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img className="w-14 h-14 rounded-lg" src="/images/burger.jpg" alt="Burger" />
                  <div>
                    <p className="font-semibold">Double Cheeseburger</p>
                    <p className="text-gray-500 text-sm">Burgers</p>
                    <p className="text-orange-500 font-bold">$8.99</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">142</p>
                  <p className="text-gray-500 text-sm">Orders</p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img className="w-14 h-14 rounded-lg" src="/images/pizza.jpg" alt="Pizza" />
                  <div>
                    <p className="font-semibold">Pepperoni Pizza</p>
                    <p className="text-gray-500 text-sm">Pizza</p>
                    <p className="text-orange-500 font-bold">$12.99</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">98</p>
                  <p className="text-gray-500 text-sm">Orders</p>
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="col-span-12 bg-white p-6 rounded-xl shadow">
              <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2">Order ID</th>
                      <th className="text-left px-4 py-2">Customer</th>
                      <th className="text-left px-4 py-2">Items</th>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Total</th>
                      <th className="text-left px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="px-4 py-2 text-orange-500 font-semibold">#FB2854</td>
                      <td className="px-4 py-2">Emily Johnson</td>
                      <td className="px-4 py-2">Double Cheeseburger, Fries (L), Soda</td>
                      <td className="px-4 py-2">Mar 8, 2025 - 12:42 PM</td>
                      <td className="px-4 py-2">$15.97</td>
                      <td className="px-4 py-2 text-green-500 font-semibold">Completed</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

  );
}
