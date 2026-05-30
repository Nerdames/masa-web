// src/core/utils/errors.ts
import { ZodError } from "zod";
import { NextResponse } from "next/server";

/**
 * Standardized API Response for Zod Validation Errors.
 * Usage: catch (err) { return zodErrorResponse(err); }
 */
export function zodErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        type: "validation_error",
        message: "Invalid input data provided.",
        // .flatten().fieldErrors provides a clean { field: ["error message"] } object
        errors: error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  // If it's not a Zod error, we re-throw it to be handled 
  // by a global 500 error handler or the Next.js boundary.
  throw error;
}

/**
 * Standardized API Response for Security/RBAC violations.
 */
export function securityErrorResponse(message = "Unauthorized access.") {
  return NextResponse.json(
    {
      type: "security_error",
      message,
    },
    { status: 403 }
  );
}

/**
 * Generic Error Handler for Server Actions/Routes
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "A system error occurred within the Fortress layer.";
}