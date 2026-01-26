import { ZodError } from "zod";
import { NextResponse } from "next/server";

export function zodErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        type: "validation_error",
        errors: error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }
  throw error;
}
