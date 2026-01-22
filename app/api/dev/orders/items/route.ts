import { prisma } from ""@/lib/prisma"";
import { NextRequest, NextResponse } from ""next/server"";
import { requireDev } from ""@/lib/guards/requireDev"";

export async function GET(req: NextRequest) {
  await requireDev(req);
  const data = await prisma.orders_items.findMany();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  await requireDev(req);
  const body = await req.json();
  const item = await prisma.orders_items.create({ data: body });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  await requireDev(req);
  const body = await req.json();
  const item = await prisma.orders_items.update({
    where: { id: body.id },
    data: body,
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  await requireDev(req);
   = await req.json();
  await prisma.orders_items.delete({ where: { id: .id } });
  return NextResponse.json({ success: true });
}
