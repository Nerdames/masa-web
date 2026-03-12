import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/* -------------------------------------------------------
   PATCH: Update Profile & Assignments
------------------------------------------------------- */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req, secret: JWT_SECRET });
  
  if (!token || !["ADMIN", "DEV"].includes(token.role as string)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const { 
      name, email, staffCode, role, branchId, action, 
      disabled, isLocked, lockReason, isPrimary 
    } = body;

    const updatedPersonnel = await prisma.$transaction(async (tx) => {
      // 1. Update Core Profile Information
      await tx.authorizedPersonnel.update({
        where: { id },
        data: { name, email, staffCode, disabled, isLocked, lockReason },
      });

      // 2. Manage Branch Assignments
      if (action === "UPDATE_ROLE" && branchId) {
        // If we are setting this branch as primary, reset all others first
        if (isPrimary) {
          await tx.branchAssignment.updateMany({
            where: { personnelId: id },
            data: { isPrimary: false },
          });
        }

        await tx.branchAssignment.upsert({
          where: {
            personnelId_branchId: {
              personnelId: id,
              branchId: branchId as string,
            },
          },
          update: { 
            role: role as Role,
            isPrimary: !!isPrimary 
          },
          create: {
            personnelId: id,
            branchId: branchId as string,
            role: role as Role,
            isPrimary: !!isPrimary,
          },
        });
      }
      
      // 3. Log the update action
      await tx.activityLog.create({
        data: {
          organizationId: token.organizationId as string,
          personnelId: token.id as string,
          action: "PERSONNEL_UPDATED",
          critical: false,
          metadata: { updatedId: id, changes: Object.keys(body) } as Prisma.JsonObject,
        },
      });

      // 4. Return the fresh data
      return await tx.authorizedPersonnel.findUnique({
        where: { id },
        include: {
          branch: { select: { id: true, name: true } },
          branchAssignments: { 
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { isPrimary: 'desc' } // Helps UI show Primary branch first
          }
        }
      });
    });

    return NextResponse.json({ 
      message: "Personnel updated successfully", 
      data: updatedPersonnel 
    });
  } catch (error) {
    console.error("PATCH Personnel error:", error);
    return NextResponse.json({ message: "Update failed" }, { status: 500 });
  }
}

/* -------------------------------------------------------
   DELETE: Soft Deactivation
------------------------------------------------------- */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req, secret: JWT_SECRET });
  
  if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { id } = params;
    
    await prisma.$transaction(async (tx) => {
      await tx.authorizedPersonnel.update({
        where: { id },
        data: { 
          deletedAt: new Date(),
          disabled: true 
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: token.organizationId as string,
          personnelId: token.id as string,
          action: "PERSONNEL_DEACTIVATED",
          critical: true,
        },
      });
    });

    return NextResponse.json({ message: "Personnel deactivated successfully" });
  } catch (error) {
    console.error("DELETE Personnel error:", error);
    return NextResponse.json({ message: "Deletion failed" }, { status: 500 });
  }
}