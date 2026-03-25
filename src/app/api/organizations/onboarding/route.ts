import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma"; // Ensure this points to your singleton prisma client
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

/**
 * Mapping roles to specific segment codes as per MASA Terminal v3.0 specs.
 * Includes the new AUDITOR role from your updated schema.
 */
const ROLE_CODE: Record<Role, string> = {
  ADMIN: "01",
  MANAGER: "02",
  SALES: "03",
  INVENTORY: "04",
  CASHIER: "05",
  AUDITOR: "06", // Synced with schema Turn 2 updates
  DEV: "99",
};

async function generateStaffCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  role: Role
) {
  // Scoped count to ensure sequential codes within this specific organization
  const personnelCount = await tx.authorizedPersonnel.count({
    where: { organizationId },
  });

  const seq = (personnelCount + 1).toString().padStart(3, "0");
  const roleCode = ROLE_CODE[role] || "00";

  // Format: STF-001-01 (Unique within the Organization)
  return `STF-${seq}-${roleCode}`;
}

/* ------------------------------------------------ */
/* RATE LIMITER (Non-Sticky for Vercel/Serverless) */
/* ------------------------------------------------ */

const rateLimitMap = new Map<string, number>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const window = 30000; // 30-second security cooldown
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
/* POST HANDLER - INFRASTRUCTURE PROVISIONING */
/* ------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Rate Limit Check
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Security Throttle: Please wait 30 seconds." },
        { status: 429 }
      );
    }

    // 2. Body Parsing & Validation
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

    // 3. Global Email Uniqueness Check 
    // (Crucial for the Terminal Sign-In page to resolve the correct account)
    const existingPersonnel = await prisma.authorizedPersonnel.findFirst({
      where: { email },
    });

    if (existingPersonnel) {
      return NextResponse.json(
        { error: "This email identifier is already provisioned in the MASA network." },
        { status: 409 }
      );
    }

    // 4. Secure Credential Hashing
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    /* ------------------------------------------------ */
    /* ATOMIC TRANSACTION - "ALL OR NOTHING" */
    /* ------------------------------------------------ */

    const result = await prisma.$transaction(async (tx) => {
      // Step A: Create the Organization (ownerId left null temporarily)
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          active: true,
        },
      });

      // Step B: Create the Initial Branch
      const branch = await tx.branch.create({
        data: {
          name: branchName,
          location: branchLocation,
          organizationId: organization.id,
        },
      });

      // Step C: Generate the first Staff Code (STF-001-01)
      const staffCode = await generateStaffCode(
        tx,
        organization.id,
        Role.ADMIN
      );

      // Step D: Provision the Owner (AuthorizedPersonnel)
      // Note: requiresPasswordChange is set to false as they just set it.
      const owner = await tx.authorizedPersonnel.create({
        data: {
          name: ownerName,
          email,
          password: passwordHash,
          role: Role.ADMIN,
          staffCode,
          organizationId: organization.id,
          branchId: branch.id, // Linking primary branch directly
          isOrgOwner: true,
          requiresPasswordChange: false,
          lastLoginIp: ip,
        },
      });

      // Step E: Establish Branch Assignment (RBAC/ABAC link)
      await tx.branchAssignment.create({
        data: {
          personnelId: owner.id,
          branchId: branch.id,
          role: Role.ADMIN,
          isPrimary: true,
        },
      });

      // Step F: Solve Circular Relation (Assign owner to Organization)
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerId: owner.id },
      });

      // Step G: Create Critical System Audit Log
      await tx.activityLog.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          personnelId: owner.id,
          action: "SYSTEM_INITIALIZED",
          critical: true,
          ipAddress: ip,
          metadata: { 
            staffCode, 
            provisioning_version: "3.0",
            event: "PRIMARY_NODE_ACTIVE" 
          },
        },
      });

      return {
        orgId: organization.id,
        staffCode,
        email: owner.email,
      };
    }, {
        timeout: 15000 // Extended timeout for infra provisioning
    });

    return NextResponse.json(
      {
        success: true,
        message: "Infrastructure provisioned successfully. Terminal active.",
        data: result,
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    // Advanced Error Resolution for Production
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[PRISMA_INFRA_ERROR]", { code: error.code, meta: error.meta });
      
      // P2002: Unique constraint failed (e.g., race condition on staffCode)
      if (error.code === 'P2002') {
         return NextResponse.json(
          { error: "A unique identifier conflict occurred. This node might have been provisioned simultaneously." },
          { status: 409 }
        );
      }
    } else {
      console.error("[ONBOARDING_CRITICAL_FAILURE]", error);
    }

    return NextResponse.json(
      { error: "Internal System Fault during infrastructure provisioning." },
      { status: 500 }
    );
  }
}