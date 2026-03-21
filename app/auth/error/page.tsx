"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  // Map error codes to Boxicons classes and messages
  const errorMap: Record<string, { title: string; message: string; iconClass: string }> = {
    Configuration: {
      title: "Server Error",
      message: "There is a problem with the server setup. Please contact your administrator.",
      iconClass: "bx bx-cog bx-tada",
    },
    AccessDenied: {
      title: "Access Denied",
      message: "You do not have permission to sign in to this application.",
      iconClass: "bx bxs-shield-x",
    },
    Verification: {
      title: "Link Expired",
      message: "The sign-in link has expired or has already been used.",
      iconClass: "bx bx-time-five",
    },
    locked: {
      title: "Account Locked",
      message: "Your account has been locked due to security concerns.",
      iconClass: "bx bxs-lock-open-alt", // or bx-lock-alt
    },
    disabled: {
      title: "Account Disabled",
      message: "Your account is currently disabled. Please contact HR.",
      iconClass: "bx bx-user-x",
    },
    organization_inactive: {
      title: "Org Suspended",
      message: "Your organization's access has been suspended.",
      iconClass: "bx bx-buildings",
    },
    Default: {
      title: "Auth Error",
      message: "An unexpected error occurred during sign-in.",
      iconClass: "bx bx-error-circle",
    },
  };

  const { title, message, iconClass } = errorMap[error as string] || errorMap.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl border border-slate-200">
        <div className="flex flex-col items-center text-center">
          
          {/* Boxicon Container */}
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
            <i className={`${iconClass} text-5xl text-red-600`}></i>
          </div>
          
          <h1 className="mb-2 text-2xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          <p className="mb-8 text-slate-500 leading-relaxed">
            {message}
          </p>

          <div className="flex w-full flex-col gap-3">
            <Link
              href="/auth/signin"
              className="group flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700 active:scale-95"
            >
              Try Again
              <i className="bx bx-refresh text-lg group-hover:rotate-180 transition-transform duration-500"></i>
            </Link>
            
            <Link
              href="/"
              className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <i className="bx bx-left-arrow-alt text-xl"></i>
              Back to Home
            </Link>
          </div>
        </div>
        
        {/* Technical Footer */}
        <div className="mt-10 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-[10px] uppercase tracking-widest text-slate-400">
          <i className="bx bx-code-alt"></i>
          <span>Status: {error || "unknown_failure"}</span>
        </div>
      </div>
    </div>
  );
}