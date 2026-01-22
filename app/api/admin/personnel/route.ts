import { prisma } from ""@/lib/prisma"";
import { NextRequest, NextResponse } from ""next/server"";
import { requireAdmin } from ""@/lib/guards/requireAdmin"";

export async function GET(req: NextRequest) {
  await requireAdmin(req);
  const data = await prisma.personnel.findMany();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  await requireAdmin(req);
  const body = await req.json();
  const item = await prisma.personnel.create({ data: body });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  await requireAdmin(req);
  const body = await req.json();
  const item = await prisma.personnel.update({
    where: { id: body.id },
    data: body,
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  await requireAdmin(req);
   = await req.json();
  await prisma.personnel.delete({ where: { id: .id } });
  return NextResponse.json({ success: true });
}
