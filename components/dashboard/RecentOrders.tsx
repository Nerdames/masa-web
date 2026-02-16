interface RecentOrder {
  id: string;
  customer: string;
  items: string;
  date: string;
  total: string;
  status: string;
}

interface RecentOrdersProps {
  orders: RecentOrder[];
}

export default function RecentOrders({ orders }: RecentOrdersProps) {
  return (
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
            {orders.map((order) => (
              <tr key={order.id} className="border-b">
                <td className="px-4 py-2 text-orange-500 font-semibold">{order.id}</td>
                <td className="px-4 py-2">{order.customer}</td>
                <td className="px-4 py-2">{order.items}</td>
                <td className="px-4 py-2">{order.date}</td>
                <td className="px-4 py-2">{order.total}</td>
                <td className="px-4 py-2 text-green-500 font-semibold">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
