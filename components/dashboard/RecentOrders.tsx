interface RecentOrder {
  id: string;
  customer: string;
  items: string;
  date: string;
  total: number;
  status: "Completed" | "Pending" | "Cancelled";
}

interface RecentOrdersProps {
  orders: RecentOrder[];
}

const statusStyles = {
  Completed: "text-green-700 bg-green-100",
  Pending: "text-yellow-700 bg-yellow-100",
  Cancelled: "text-red-700 bg-red-100",
};

export default function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="col-span-12 bg-white p-6 rounded-xl shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Recent Orders
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Order ID</th>
              <th className="text-left px-4 py-2 font-medium">Customer</th>
              <th className="text-left px-4 py-2 font-medium">Items</th>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Total</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>

          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500">
                  No recent orders
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="px-4 py-3 font-semibold text-orange-500">
                    {order.id}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {order.customer}
                  </td>

                  <td className="px-4 py-3 text-gray-600">
                    {order.items}
                  </td>

                  <td className="px-4 py-3 text-gray-600">
                    {order.date}
                  </td>

                  <td className="px-4 py-3 font-medium text-gray-800">
                    ₦{order.total.toLocaleString()}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-md ${statusStyles[order.status]}`}
                    >
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}