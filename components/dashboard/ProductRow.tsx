"use client";
import { FC } from "react";

export interface ChartDataProduct {
  id: string;
  name: string;
  qty: number;
  price: number;
  totalSold: number;
  revenue: number;
}

interface ProductRowProps {
  product: ChartDataProduct;
}

const ProductRow: FC<ProductRowProps> = ({ product }) => {
  return (
    <li className="flex justify-between border-b border-gray-100 py-1">
      <span>{product.name}</span>
      <span className="font-semibold">{product.qty}</span>
    </li>
  );
};

export default ProductRow;
