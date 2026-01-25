import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthenticated" }, { status: 401 });
  }

  const { role, organizationId } = session.user;

  const allowed =
    role === Role.DEV || role === Role.ADMIN || role === Role.MANAGER;

  if (!allowed) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 10);
  const search = searchParams.get("search") ?? "";

  const where = {
    organizationId,
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total, activeCount] = await Promise.all([
    prisma.authorizedPersonnel.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.authorizedPersonnel.count({ where }),
    prisma.authorizedPersonnel.count({
      where: { ...where, disabled: false },
    }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    activeCount,
  });
}
