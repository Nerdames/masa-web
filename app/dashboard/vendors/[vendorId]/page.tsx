// app/dashboard/vendors/[vendorId]/page.tsx
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import VendorDetailClient from "./VendorDetailClient"; // Client Component
import type { VendorDetail } from "./VendorDetailClient";

interface VendorPageProps {
  params: { vendorId: string };
}

type UserSession = {
  user: {
    id: string;
    role: string;
    branchId?: string;
  };
  organizationId: string;
};

export default async function VendorPage({ params }: VendorPageProps) {
  const { vendorId } = params;

  // Get the logged-in user session
  const session = (await getServerSession()) as UserSession | null;
  if (!session) redirect("/auth/login");

  // Fetch vendor for this organization
  const vendorData = await prisma.vendor.findFirst({
    where: {
      id: vendorId,
      organizationId: session.organizationId,
      deletedAt: null,
    },
    include: {
      branchProducts: {
        include: {
          product: true,
          branch: true,
        },
      },
    },
  });

  if (!vendorData) return notFound();

  // Transform for client
  const vendor: VendorDetail = {
    id: vendorData.id,
    name: vendorData.name,
    email: vendorData.email ?? null,
    phone: vendorData.phone ?? null,
    address: vendorData.address ?? null,
    createdAt: vendorData.createdAt.toISOString(),
    updatedAt: vendorData.updatedAt.toISOString(),
    branchProducts: vendorData.branchProducts.map(bp => ({
      branch: bp.branch ? { id: bp.branch.id, name: bp.branch.name } : null,
      product: { id: bp.product.id, name: bp.product.name },
      stock: bp.stock,
      unit: bp.unit ?? "pcs",
      reorderLevel: bp.reorderLevel,
      sellingPrice: bp.sellingPrice,
    })),
  };

  return <VendorDetailClient vendor={vendor} />;
}