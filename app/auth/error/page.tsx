"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * AuthErrorPage: A hardened error interface for MASA ERP.
 * Maps internal security exceptions to user-facing protocols.
 */
export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMap: Record<string, { title: string; message: string; iconClass: string; details?: string }> = {
    // --- Infrastructure & Config --- [cite: 115, 134]
    Configuration: {
      title: "System Misconfiguration",
      message: "The security handshake failed due to a server-side configuration error.",
      iconClass: "bx bx-cog bx-tada",
      details: "Check NEXTAUTH_SECRET and Provider ID alignment.",
    },

    // --- Session & Identity Hardening --- 
    SessionExpired: {
      title: "Oops!, something went wrong",
      message: "You may have pressed the back button, refreshed during login, or there is an issue with cookies.",
      iconClass: "bx bx-time-five",
      details: "Since we couldn't find your session, the security protocol was terminated. Please re-authenticate.",
    },

    // --- Organization Shield --- [cite: 114, 115]
    ORGANIZATION_SUSPENDED: {
      title: "Org Suspended",
      message: "Access to this instance has been restricted by the system administrator.",
      iconClass: "bx bx-buildings",
      details: "Your organization status is currently 'Inactive'. Contact billing or support.",
    },

    // --- Security Blockades --- [cite: 119, 122, 140]
    ACCOUNT_LOCKED: {
      title: "Access Revoked",
      message: "Your credentials have been flagged and the account is currently locked.",
      iconClass: "bx bxs-lock-alt",
      details: "Reason: EXCESSIVE_FAILED_ATTEMPTS. A 15-minute cool-off period is active.",
    },
    ACCOUNT_DISABLED: {
      title: "Identity Disabled",
      message: "Your personnel record has been deactivated within the MASA platform.",
      iconClass: "bx bx-user-x",
      details: "Please contact Human Resources or your System Architect.",
    },
    AccessDenied: {
      title: "Protocol Denied",
      message: "You do not have the required clearance to access this module.",
      iconClass: "bx bxs-shield-x",
    },

    // --- Default / Generic Fallback --- [cite: 161]
    Default: {
      title: "Auth Protocol Error",
      message: "An unexpected error occurred during the secure handshake.",
      iconClass: "bx bx-error-circle",
      details: "Status Code: " + (error || "UNKNOWN_AUTH_FAILURE"),
    },
  };

  const { title, message, iconClass, details } = errorMap[error as string] || errorMap.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl border border-slate-200">
        <div className="flex flex-col items-center text-center">
          
          {/* Status Icon */}
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-red-50 shadow-inner">
            <i className={`${iconClass} text-5xl text-red-600`}></i>
          </div>
          
          <h1 className="mb-3 text-2xl font-black text-slate-900 tracking-tight uppercase">
            {title}
          </h1>
          <p className="mb-8 text-slate-500 text-sm leading-relaxed font-medium">
            {message}
          </p>

          {/* Technical Details Block (MASA Fortress Style) */}
          {details && (
            <div className="mb-8 w-full rounded-2xl bg-slate-50 p-5 text-left border border-slate-100">
              <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <i className="bx bx-terminal text-sm"></i>
                <span>Technical Details</span>
              </div>
              <p className="text-[11px] font-mono text-slate-600 leading-normal">
                {details}
              </p>
            </div>
          )}

          <div className="flex w-full flex-col gap-3">
            <Link
              href="/auth/signin"
              className="group flex items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 active:scale-95 shadow-xl shadow-slate-900/10"
            >
              Restart Protocol
              <i className="bx bx-refresh text-xl group-hover:rotate-180 transition-transform duration-700"></i>
            </Link>
            
            <Link
              href="/"
              className="flex items-center justify-center gap-2 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-tighter"
            >
              <i className="bx bx-chevron-left text-lg"></i>
              Return to Gateway
            </Link>
          </div>
        </div>
        
        {/* Support Section */}
        <div className="mt-10 flex flex-col items-center border-t border-slate-100 pt-8">
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mb-2">Support</span>
           <p className="text-[11px] font-medium text-slate-500">
            Please contact the systems administrator.
           </p>
        </div>
      </div>
    </div>
  );
}