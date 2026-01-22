// app/api/admin/organizations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma  from "@/lib/prisma";

const secret = process.env.NEXTAUTH_SECRET as string;

export type OrganizationResponse = {
  id: string;
  name: string;
  active: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let orgs: OrganizationResponse[] = [];

    if (token.role === "DEV") {
      // DEV sees all organizations
      orgs = await prisma.organization.findMany({
        select: { id: true, name: true, active: true },
      });
    } else if (token.role === "ADMIN" || token.role === "MANAGER") {
      // Admin/Manager sees only their org
      if (token.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: token.organizationId as string },
          select: { id: true, name: true, active: true },
        });
        if (org) orgs.push(org);
      }
    }

    return NextResponse.json({ orgs });
  } catch (error) {
    console.error("GET /api/organizations error:", error);
    return NextResponse.json(
      { orgs: [], error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || token.role !== "DEV") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const newOrg = await prisma.organization.create({
      data: {
        name: body.name,
        active: body.active ?? true,
      },
    });

    return NextResponse.json(newOrg);
  } catch (error) {
    console.error("POST /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || token.role !== "DEV") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updatedOrg = await prisma.organization.update({
      where: { id: body.id },
      data: {
        name: body.name,
        active: body.active,
      },
    });

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error("PUT /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || token.role !== "DEV") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    await prisma.organization.delete({ where: { id: body.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
  }
}
