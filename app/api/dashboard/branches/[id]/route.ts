import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface PatchBranchBody {
  name?: string;
  active?: boolean;
  location?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const branchId = params.id;
    if (!branchId) {
      return NextResponse.json(
        { error: "Missing branch ID" },
        { status: 400 }
      );
    }

    const body: PatchBranchBody = await req.json();

    const { name, active, location } = body;

    // Only update provided fields
    const data: Partial<PatchBranchBody> = {};
    if (name !== undefined) data.name = name;
    if (active !== undefined) data.active = active;
    if (location !== undefined) data.location = location;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const branch = await prisma.branch.update({
      where: { id: branchId },
      data,
    });

    return NextResponse.json(branch);
  } catch (err) {
    console.error(`PATCH /branches/${params.id} error:`, err);
    return NextResponse.json(
      { error: "Failed to update branch" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const branchId = params.id;
    if (!branchId) {
      return NextResponse.json(
        { error: "Missing branch ID" },
        { status: 400 }
      );
    }

    // Soft delete by setting deletedAt
    const branch = await prisma.branch.update({
      where: { id: branchId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: "Branch deleted (soft delete)",
      branch,
    });
  } catch (err) {
    console.error(`DELETE /branches/${params.id} error:`, err);
    return NextResponse.json(
      { error: "Failed to delete branch" },
      { status: 500 }
    );
  }
}
