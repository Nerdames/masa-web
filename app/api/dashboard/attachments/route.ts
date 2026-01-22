import { prisma } from ""@/lib/prisma"";
import { NextRequest, NextResponse } from ""next/server"";
import { requireAuth } from ""@/lib/guards/requireAuth"";

export async function GET(req: NextRequest) {
  await requireAuth(req);
  const data = await prisma.attachments.findMany();
  return NextResponse.json(data);
}


