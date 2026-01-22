import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CustomerGroup } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const organizationId = req.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ groups: [] });

    const groups = await prisma.customerGroup.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { customers: true },
    });

    return NextResponse.json({ groups });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ groups: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Pick<CustomerGroup, "name" | "description" | "organizationId"> = await req.json();
    const { name, organizationId } = body;
    if (!name || !organizationId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const group = await prisma.customerGroup.create({ data: body });
    return NextResponse.json(group);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Group ID required" }, { status: 400 });

    const body: Partial<Omit<CustomerGroup, "id" | "createdAt">> = await req.json();

    const group = await prisma.customerGroup.update({ where: { id }, data: body });
    return NextResponse.json(group);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Group ID required" }, { status: 400 });

    await prisma.customerGroup.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
