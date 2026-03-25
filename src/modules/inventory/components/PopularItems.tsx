interface PopularItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image?: string;
  orders: number;
}

interface PopularItemsProps {
  items: PopularItem[];
}

export default function PopularItems({ items }: PopularItemsProps) {
  return (
    <div className="col-span-12 lg:col-span-4 bg-white p-6 rounded-xl shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Popular Items
        </h2>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No popular items yet
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition"
            >
              {/* Left */}
              <div className="flex items-center gap-3">
                <img
                  src={item.image || "/images/placeholder-food.png"}
                  alt={item.name}
                  className="w-14 h-14 rounded-lg object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "/images/placeholder-food.png";
                  }}
                />

                <div>
                  <p className="font-semibold text-gray-800">
                    {item.name}
                  </p>

                  <p className="text-gray-500 text-sm">
                    {item.category}
                  </p>

                  <p className="text-orange-500 font-bold">
                    ₦{item.price.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Right */}
              <div className="text-right">
                <p className="font-semibold text-gray-800">
                  {item.orders}
                </p>
                <p className="text-gray-500 text-xs">Orders</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}