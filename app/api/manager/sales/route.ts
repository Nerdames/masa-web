import { prisma } from ""@/lib/prisma"";
import { NextRequest, NextResponse } from ""next/server"";
import { requireBranchRole } from ""@/lib/guards/requireBranchRole"";

export async function GET(req: NextRequest) {
  await requireBranchRole(req);
  const data = await prisma.sales.findMany();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  await requireBranchRole(req);
  const body = await req.json();
  const item = await prisma.sales.create({ data: body });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  await requireBranchRole(req);
  const body = await req.json();
  const item = await prisma.sales.update({
    where: { id: body.id },
    data: body,
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  await requireBranchRole(req);
   = await req.json();
  await prisma.sales.delete({ where: { id: .id } });
  return NextResponse.json({ success: true });
}
