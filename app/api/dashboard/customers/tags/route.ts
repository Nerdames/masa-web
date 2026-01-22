import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CustomerTag } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const organizationId = req.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ tags: [] });

    const tags = await prisma.customerTag.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    });

    return NextResponse.json({ tags });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ tags: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Pick<CustomerTag, "name" | "organizationId" | "customerId"> = await req.json();
    const { name, organizationId, customerId } = body;
    if (!name || !organizationId || !customerId)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const tag = await prisma.customerTag.create({ data: body });
    return NextResponse.json(tag);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Tag ID required" }, { status: 400 });

    const body: Partial<Omit<CustomerTag, "id" | "createdAt">> = await req.json();
    const tag = await prisma.customerTag.update({ where: { id }, data: body });
    return NextResponse.json(tag);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Tag ID required" }, { status: 400 });

    await prisma.customerTag.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
