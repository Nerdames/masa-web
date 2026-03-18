import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma"; // Adjust path
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";

/* ------------------------------------------------ */
/* VALIDATION SCHEMA */
/* ------------------------------------------------ */

const OnboardingSchema = z.object({
  orgName: z.string().min(2, "Organization name is too short").max(120),
  branchName: z.string().min(2, "Branch name is too short").max(120),
  branchLocation: z.string().max(200).optional().nullable(),
  ownerName: z.string().min(2, "Administrator name is required"),
  ownerEmail: z.string().email("Invalid email format"),
  ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/* ------------------------------------------------ */
/* STAFF CODE GENERATOR (Scoped to Tenant) */
/* ------------------------------------------------ */

const ROLE_CODE: Record<Role, string> = {
  ADMIN: "01",
  MANAGER: "02",
  SALES: "03",
  INVENTORY: "04",
  CASHIER: "05",
  DEV: "99",
};

async function generateStaffCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  role: Role
) {
  // Safe scoped count
  const personnelCount = await tx.authorizedPersonnel.count({
    where: { organizationId },
  });

  const seq = (personnelCount + 1).toString().padStart(3, "0");
  const roleCode = ROLE_CODE[role];

  // Output: STF-001-01 (Unique within the Organization)
  return `STF-${seq}-${roleCode}`;
}

/* ------------------------------------------------ */
/* RATE LIMITER (Non-Sticky for Vercel/Serverless) */
/* ------------------------------------------------ */

const rateLimitMap = new Map<string, number>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const window = 30000; // 30 seconds
  const lastRequest = rateLimitMap.get(ip);

  if (lastRequest && now - lastRequest < window) {
    return true;
  }

  rateLimitMap.set(ip, now);
  return false;
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

/* ------------------------------------------------ */
/* POST HANDLER */
/* ------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait 30 seconds." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      orgName,
      branchName,
      branchLocation,
      ownerName,
      ownerEmail,
      ownerPassword,
    } = parsed.data;

    const email = ownerEmail.toLowerCase().trim();

    // FIXED: Removed the invalid { not: undefined } filter
    // Check if the email already exists in the entire system.
    const existingEmail = await prisma.authorizedPersonnel.findFirst({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "This email is already registered." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    /* ------------------------------------------------ */
    /* ATOMIC TRANSACTION */
    /* ------------------------------------------------ */

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          active: true,
        },
      });

      // 2. Create Primary Branch
      const branch = await tx.branch.create({
        data: {
          name: branchName,
          location: branchLocation,
          organizationId: organization.id,
        },
      });

      // 3. Generate AuthCode
      const staffCode = await generateStaffCode(
        tx,
        organization.id,
        Role.ADMIN
      );

      // 4. Create Owner (Personnel)
      const owner = await tx.authorizedPersonnel.create({
        data: {
          name: ownerName,
          email,
          password: passwordHash,
          role: Role.ADMIN,
          staffCode,
          organizationId: organization.id,
          branchId: branch.id,
          isOrgOwner: true,
          requiresPasswordChange: false,
        },
      });

      // 5. Create Primary Branch Assignment
      await tx.branchAssignment.create({
        data: {
          personnelId: owner.id,
          branchId: branch.id,
          role: Role.ADMIN,
          isPrimary: true,
        },
      });

      // 6. Link Owner back to Organization
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerId: owner.id },
      });

      // 7. Log Activity
      await tx.activityLog.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          personnelId: owner.id,
          action: "SYSTEM_INITIALIZED",
          critical: true,
          ipAddress: ip,
          metadata: { staffCode },
        },
      });

      return {
        orgId: organization.id,
        staffCode,
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Infrastructure provisioned.",
        data: result,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Advanced error logging for Prisma crashes
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[PRISMA_ERROR]", error.code, error.meta);
      
      // Specifically catch P2002 (Unique constraint failed)
      if (error.code === 'P2002') {
         return NextResponse.json(
          { error: "A unique identifier conflict occurred. Please try again." },
          { status: 409 }
        );
      }
    } else {
      console.error("[ONBOARDING_CRITICAL_ERROR]", error);
    }

    return NextResponse.json(
      { error: "Internal Server Error during provisioning." },
      { status: 500 }
    );
  }
}