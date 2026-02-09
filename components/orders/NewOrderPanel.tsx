"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";

interface Buyer { id: string; name: string; }
interface InventoryProduct { id: string; name: string; sku: string; stock: number; sellingPrice: number; }
interface CartItem { name: string; sku: string; quantity: number; price: number; }

const TABLE_WRAPPER = "w-full text-sm table-fixed border-separate border-spacing-y-2";
const TABLE_HEAD = "text-xs bg-gray-100 uppercase text-gray-500 text-center";
const TABLE_ROW = "bg-white rounded-xl shadow-sm transition cursor-pointer hover:bg-green-50";
const TABLE_ROW_SELECTED = "bg-green-100 text-green-800";

export default function NewOrderPanel() {
  const toast = useToast();
  const { data: session } = useSession();

  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState("");
  const [newBuyer, setNewBuyer] = useState("");
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartSKUs, setSelectedCartSKUs] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<"submit" | "delete" | null>(null);

  useEffect(() => {
    fetch("/api/customers").then(res => res.json()).then(data => setBuyers(data.customers ?? []));
    fetch("/api/dashboard/products").then(res => res.json()).then(data => setProducts(data.data ?? []));
  }, []);

  const addToCart = (p: InventoryProduct) => {
    if (p.stock <= 0) return toast.addToast({ type: "error", message: "Out of stock" });
    setCart(prev => prev.some(c => c.sku === p.sku) ? prev : [...prev, { sku: p.sku, name: p.name, quantity: 1, price: p.sellingPrice }]);
  };

  const updateCartQuantity = (sku: string, value: number) => {
    setCart(prev => prev.map(item => {
      if (item.sku !== sku) return item;
      const product = products.find(p => p.sku === sku);
      if (!product) return item;
      const qty = Math.min(Math.max(1, value), product.stock);
      return { ...item, quantity: qty };
    }));
  };

  const incrementQuantity = (sku: string) => updateCartQuantity(sku, (cart.find(i => i.sku === sku)?.quantity ?? 0) + 1);
  const decrementQuantity = (sku: string) => updateCartQuantity(sku, (cart.find(i => i.sku === sku)?.quantity ?? 0) - 1);

  const removeSelectedFromCart = () => {
    const removed = cart.filter(i => selectedCartSKUs.has(i.sku));
    setCart(prev => prev.filter(i => !selectedCartSKUs.has(i.sku)));
    setSelectedCartSKUs(new Set());
    toast.show({ title: "Items removed", description: "Selected items removed from cart", actionLabel: "Undo", onAction: () => setCart(prev => [...prev, ...removed]) });
  };

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const submitOrder = async () => {
    let buyerId = selectedBuyer;
    if (!buyerId && newBuyer.trim()) {
      const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newBuyer.trim() }) });
      const data = await res.json();
      buyerId = data.id;
    }
    if (!buyerId) return toast.addToast({ type: "error", message: "Select a buyer" });
    if (!cart.length) return toast.addToast({ type: "error", message: "Cart is empty" });

    const personnelId = session?.user?.id ?? null;

    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: buyerId,
        personnelId,
        products: cart.map(i => ({ sku: i.sku, quantity: i.quantity, price: i.price, total: i.price * i.quantity })),
        totalAmount: subtotal
      })
    });

    toast.addToast({ type: "success", message: "Order created" });
    setCart([]);
    setSelectedBuyer("");
    setNewBuyer("");
    setSelectedCartSKUs(new Set());
  };

  const filteredProducts = useMemo(() => search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : products, [products, search]);

  const toggleSelectCart = (sku: string) => setSelectedCartSKUs(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  const toggleSelectAllCart = () => selectedCartSKUs.size === cart.length ? setSelectedCartSKUs(new Set()) : setSelectedCartSKUs(new Set(cart.map(c => c.sku)));

  const isDeleteMode = selectedCartSKUs.size > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 min-h-[calc(100vh-4rem)]">

      {/* Products */}
      <div className="lg:w-1/2 bg-gray-50 rounded-xl shadow-sm flex flex-col">
        {/* Top Filters */}
        <div className="p-4 flex flex-col gap-3 rounded-t-xl bg-gray-50">
          <select className="border rounded-lg p-2 w-full" value={selectedBuyer} onChange={e => setSelectedBuyer(e.target.value)}>
            <option value="">Select Buyer</option>
            {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input className="border rounded-lg p-2 w-full" placeholder="New buyer" value={newBuyer} onChange={e => setNewBuyer(e.target.value)} />
          <input className="border rounded-lg p-2 w-full" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-auto p-4">
          <table className={TABLE_WRAPPER}>
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Price</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id} className={TABLE_ROW} onClick={() => addToCart(p)}>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.sku}</td>
                  <td className="p-3 text-center">{p.stock}</td>
                  <td className="p-3 text-center">₦{p.sellingPrice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cart */}
      <div className="lg:w-1/2 bg-gray-50 rounded-xl shadow-sm flex flex-col">
        {/* Cart Header */}
        <div className="sticky top-0 p-4 font-semibold text-lg shadow-sm rounded-t-xl bg-gray-50 z-10">Cart</div>
        
        {/* Cart Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className={TABLE_WRAPPER}>
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="p-3 w-10 text-center">
                  <input type="checkbox" checked={cart.length > 0 && selectedCartSKUs.size === cart.length} onChange={toggleSelectAllCart} />
                </th>
                <th className="p-3">Product</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.map(item => {
                const selected = selectedCartSKUs.has(item.sku);
                return (
                  <tr key={item.sku} className={`${TABLE_ROW} ${selected ? TABLE_ROW_SELECTED : ""}`} onClick={() => toggleSelectCart(item.sku)}>
                    <td className="p-3 text-center"><input type="checkbox" checked={selected} readOnly /></td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3 flex items-center justify-center gap-1">
                      <Tooltip content="Decrease quantity">
                        <motion.button whileTap={{ scale: 0.8 }} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center" onClick={e => { e.stopPropagation(); decrementQuantity(item.sku); }}><i className="bx bx-minus" /></motion.button>
                      </Tooltip>
                      <input type="number" className="w-16 border rounded text-center" value={item.quantity} onClick={e => e.stopPropagation()} onChange={e => updateCartQuantity(item.sku, +e.target.value)} />
                      <Tooltip content="Increase quantity">
                        <motion.button whileTap={{ scale: 0.8 }} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center" onClick={e => { e.stopPropagation(); incrementQuantity(item.sku); }}><i className="bx bx-plus" /></motion.button>
                      </Tooltip>
                    </td>
                    <td className="p-3 text-center font-semibold">
                      <AnimatePresence mode="wait">
                        <motion.div key={item.quantity} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>₦{item.price * item.quantity}</motion.div>
                      </AnimatePresence>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cart Footer */}
        <div className="p-4 text-sm flex justify-between font-semibold text-base border-t border-gray-200">
          <span>Total</span><span>₦{subtotal}</span>
        </div>
      </div>

      {/* FAB */}
      <motion.div className="fixed bottom-6 right-6 z-50">
        <Tooltip content={isDeleteMode ? "Delete selected items" : "Submit order"}>
          <motion.button
            key={isDeleteMode ? "delete" : "submit"}
            onClick={() => setConfirmAction(isDeleteMode ? "delete" : "submit")}
            disabled={!cart.length || (!isDeleteMode && !selectedBuyer && !newBuyer.trim())}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl ${isDeleteMode ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} disabled:bg-gray-400 disabled:cursor-not-allowed`}
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <i className={`bx ${isDeleteMode ? "bx-trash" : "bx-check"}`} />
          </motion.button>
        </Tooltip>
      </motion.div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction === "delete" ? "Remove selected items?" : "Submit order?"}
        message={confirmAction === "delete" ? "Selected items will be removed from the cart." : "Are you sure you want to submit this order?"}
        confirmText={confirmAction === "delete" ? "Delete" : "Submit"}
        confirmVariant={confirmAction === "delete" ? "danger" : "success"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (confirmAction === "delete") removeSelectedFromCart();
          if (confirmAction === "submit") await submitOrder();
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
