import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/client"; // Singleton Prisma Client instance
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { 
  Prisma, 
  Role, 
  Resource, 
  PermissionAction, 
  Severity,
  AccountType 
} from "@prisma/client";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { OAuth2Client } from "google-auth-library";
import { createAuditLog } from "@/modules/audit/server/audit.service"; // Integrated Fortified Audit Engine

// Initialize Google OAuth Client for Fortified Token Verification
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ------------------------------------------------ */
/* ENHANCED INPUT VALIDATION SCHEMA WITH OAUTH UNION */
/* ------------------------------------------------ */

const BaseSchema = z.object({
  orgName: z.string().min(2, "Organization name is too short").max(120).trim(),
  branchName: z.string().min(2, "Branch name is too short").max(120).trim(),
  branchLocation: z.string().max(200).optional().nullable().transform(val => val || null),
});

const AuthSchema = z.discriminatedUnion("authProvider", [
  z.object({
    authProvider: z.literal("credentials"),
    ownerName: z.string().min(1, "Owner name is required").trim(),
    ownerEmail: z.string().email("Invalid email format").toLowerCase().trim(),
    ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
  }),
  z.object({
    authProvider: z.literal("google"),
    idToken: z.string().min(1, "Google ID Token is required"),
  })
]);

// Intersection creates a strict requirement based on the authProvider flag
const OnboardingSchema = z.intersection(BaseSchema, AuthSchema);

/* ------------------------------------------------ */
/* ROLE SPECIFIC SPEC SEGMENT MAPPING               */
/* ------------------------------------------------ */

const ROLE_CODE: Record<Role, string> = {
  ADMIN: "01",
  MANAGER: "02",
  SALES: "03",
  INVENTORY: "04",
  CASHIER: "05",
  AUDITOR: "06", 
  DEV: "99",
};

async function generateStaffCode(tx: Prisma.TransactionClient, organizationId: string, role: Role) {
  const personnelCount = await tx.authorizedPersonnel.count({
    where: { organizationId },
  });
  const seq = (personnelCount + 1).toString().padStart(3, "0");
  const roleCode = ROLE_CODE[role] || "00";
  return `STF-${seq}-${roleCode}`; // Format: STF-001-01
}

/* ------------------------------------------------ */
/* SERVERLESS-COMPATIBLE DISTRIBUTED RATE LIMITER   */
/* ------------------------------------------------ */

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      analytics: true,
    })
  : null;

async function checkRateLimit(ip: string): Promise<boolean> {
  if (!ratelimit) return false;
  try {
    const { success } = await ratelimit.limit(`ratelimit_onboarding_${ip}`);
    return !success;
  } catch (error) {
    console.error("[RATE_LIMIT_ERROR]", error);
    return false; // Fail open if Redis drops connection to prevent blocking valid signups
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

/* ------------------------------------------------ */
/* POST HANDLER - INFRASTRUCTURE PROVISIONING       */
/* ------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Production Distributed Rate Limiter Verification
    if (await checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Security Throttle: Excessive provisioning attempts. Please try again later." },
        { status: 429 }
      );
    }

    // 2. Request Body Parsing and Schema Validation
    const body = await req.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { orgName, branchName, branchLocation, authProvider } = parsed.data;

    // 3. Cryptographic Proof of Identity & Data Extraction
    let extractedEmail = "";
    let extractedName = "";
    let providerAccountId = "";
    let finalPasswordHash = "";

    if (parsed.data.authProvider === "google") {
      // FIX: Guard against missing Server Configurations before blaming the user's token
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("[OAUTH_CONFIG_ERROR] Missing GOOGLE_CLIENT_ID environment variable.");
        return NextResponse.json(
          { error: "Server Configuration Error: OAuth not configured properly." }, 
          { status: 500 }
        );
      }

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: parsed.data.idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        
        if (!payload || !payload.email) throw new Error("Invalid Token Payload: Missing email");
        
        extractedEmail = payload.email.toLowerCase();
        extractedName = payload.name || "System Admin";
        providerAccountId = payload.sub; // Google's unique immutable ID

        // Fulfills strict 'password String' model constraint with high-entropy random bytes
        const randomSecret = crypto.randomBytes(32).toString("hex");
        finalPasswordHash = await bcrypt.hash(randomSecret, 12);

      } catch (error: any) {
        // FIX: Surface the actual rejection reason instead of a blind 401
        console.error("[OAUTH_VERIFICATION_ERROR]", error.message);
        return NextResponse.json(
          { error: `Cryptographic identity verification failed: ${error.message}` }, 
          { status: 401 }
        );
      }
    } else if (parsed.data.authProvider === "credentials") {
      extractedEmail = parsed.data.ownerEmail;
      extractedName = parsed.data.ownerName;
      finalPasswordHash = await bcrypt.hash(parsed.data.ownerPassword, 12);
    }

    // 4. Global Network Conflict Validation (Cross-Tenant Spoofing Prevention)
    const existingPersonnel = await prisma.authorizedPersonnel.findFirst({
      where: { email: extractedEmail },
    });

    if (existingPersonnel) {
      return NextResponse.json(
        { error: "This email identifier is already provisioned in the MASA network. Please log in." },
        { status: 409 }
      );
    }

    /* ------------------------------------------------ */
    /* ATOMIC TRANSACTION - ISOLATED TENANT SEEDING     */
    /* ------------------------------------------------ */
    const result = await prisma.$transaction(async (tx) => {
      
      // Step A: Create Organization Structure
      const organization = await tx.organization.create({
        data: { name: orgName, active: true },
      });

      // Step B: Initialize Primary Corporate Node (Branch)
      const branch = await tx.branch.create({
        data: { name: branchName, location: branchLocation, organizationId: organization.id },
      });

      // Step C: Generate Scoped Personnel Sequence Identifiers
      const staffCode = await generateStaffCode(tx, organization.id, Role.ADMIN);

      // Step D: Provision System Admin Entity
      const owner = await tx.authorizedPersonnel.create({
        data: {
          name: extractedName,
          email: extractedEmail,
          password: finalPasswordHash,
          role: Role.ADMIN,
          staffCode,
          organizationId: organization.id,
          branchId: branch.id,
          isOrgOwner: true,
          requiresPasswordChange: authProvider === "credentials", // Force rotation only if they used standard login
          lastLoginIp: ip,
        },
      });

      // Step E: Establish RBAC Context via Branch Assignment
      await tx.branchAssignment.create({
        data: {
          personnelId: owner.id,
          branchId: branch.id,
          role: Role.ADMIN,
          isPrimary: true,
        },
      });

      // Step F: Resolve Circular Relationship Constraint
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerId: owner.id },
      });

      // Step G: Seed the Default Finance Account (Required for ERP transactions)
      await tx.financeAccount.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          personnelId: owner.id,
          name: "Main Cash Account",
          type: AccountType.CASH,
          currency: "NGN",
        }
      });

      // Step H: NextAuth Integration - Bind OAuth Provider Account Map
      if (authProvider === "google" && providerAccountId) {
        await tx.authAccount.create({
          data: {
            personnelId: owner.id,
            type: "oauth",
            provider: "google",
            providerAccountId: providerAccountId,
          },
        });
      }

      // Step I: Seed Core RBAC Matrix Requirements
      const allResources = Object.values(Resource);
      const allActions = Object.values(PermissionAction);
      const permissionData = allResources.map((resource) => ({
        organizationId: organization.id,
        role: Role.ADMIN,
        resource: resource,
        actions: allActions,
      }));

      await tx.resourcePermission.createMany({ data: permissionData });

      // Step J: Forensic Audit Logging Integrated
      // Replaced manual hashing with the robust createAuditLog function
      await createAuditLog(tx, {
        action: "SYSTEM_INITIALIZED",
        resource: Resource.SETTINGS, // Target generic organizational setup
        resourceId: organization.id,
        organizationId: organization.id,
        branchId: branch.id,
        actorId: owner.id,
        actorRole: Role.ADMIN,
        severity: Severity.CRITICAL,
        critical: true,
        description: "Primary node and system administrator provisioned",
        ipAddress: ip,
        metadata: {
          staffCode,
          provisioning_version: "3.1",
          event: "PRIMARY_NODE_ACTIVE",
          auth_mechanism: authProvider,
        }
      });

      return {
        orgId: organization.id,
        branchId: branch.id,
        staffCode,
        email: owner.email,
        authProvider,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 25000 
    });

    return NextResponse.json(
      {
        success: true,
        message: "Infrastructure provisioned successfully. Terminal context activated.",
        data: result,
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[PRISMA_INFRA_ERROR]", { code: error.code, meta: error.meta });
      if (error.code === 'P2002') {
         return NextResponse.json(
          { error: "A unique identifier conflict occurred. This node could not complete provisioning due to duplicate system constraints." },
          { status: 409 }
        );
      }
    } else {
      console.error("[ONBOARDING_CRITICAL_FAILURE]", error);
    }
    return NextResponse.json(
      { error: "Internal System Fault during infrastructure provisioning sequence." },
      { status: 500 }
    );
  }
}