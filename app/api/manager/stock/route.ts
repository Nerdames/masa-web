import { prisma } from ""@/lib/prisma"";
import { NextRequest, NextResponse } from ""next/server"";
import { requireBranchRole } from ""@/lib/guards/requireBranchRole"";

export async function GET(req: NextRequest) {
  await requireBranchRole(req);
  const data = await prisma.stock.findMany();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  await requireBranchRole(req);
  const body = await req.json();
  const item = await prisma.stock.create({ data: body });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  await requireBranchRole(req);
  const body = await req.json();
  const item = await prisma.stock.update({
    where: { id: body.id },
    data: body,
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  await requireBranchRole(req);
   = await req.json();
  await prisma.stock.delete({ where: { id: .id } });
  return NextResponse.json({ success: true });
}
