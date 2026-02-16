interface PopularItem {
  name: string;
  category: string;
  price: number;
  image: string;
  orders: number;
}

interface PopularItemsProps {
  items: PopularItem[];
}

export default function PopularItems({ items }: PopularItemsProps) {
  return (
    <div className="col-span-12 lg:col-span-4 bg-white p-6 rounded-xl shadow">
      <h2 className="text-lg font-semibold mb-4">Popular Items</h2>
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img className="w-14 h-14 rounded-lg" src={item.image} alt={item.name} />
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="text-gray-500 text-sm">{item.category}</p>
              <p className="text-orange-500 font-bold">${item.price}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold">{item.orders}</p>
            <p className="text-gray-500 text-sm">Orders</p>
          </div>
        </div>
      ))}
    </div>
  );
}
