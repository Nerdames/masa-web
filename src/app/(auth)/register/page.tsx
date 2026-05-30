"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";

/* -------------------------
  Schema & Types (Synced with API)
------------------------- */

const BaseOnboarding = z.object({
  orgName: z.string().min(2, "Organization name is too short").max(120).trim(),
  branchName: z.string().min(2, "Branch name is too short").max(120).trim(),
  branchLocation: z.string().max(200).optional().nullable(),
});

// Discriminated union explicitly isolates the validation rules based on authProvider
const OnboardingSchema = z.discriminatedUnion("authProvider", [
  // 1. CREDENTIALS FLOW: Enforce strict rules
  BaseOnboarding.extend({
    authProvider: z.literal("credentials"),
    ownerName: z.string().min(1, "Owner name is required").trim(),
    ownerEmail: z.string().email("Invalid email format").toLowerCase().trim(),
    ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
    idToken: z.string().optional(),
  }),
  // 2. GOOGLE FLOW: Require token, but allow empty strings ("") for unused React inputs
  BaseOnboarding.extend({
    authProvider: z.literal("google"),
    idToken: z.string().min(1, "OAuth Identity Token is required"),
    ownerName: z.string().optional(),
    ownerEmail: z.union([z.literal(""), z.string().email("Invalid email format")]).optional(),
    ownerPassword: z.union([z.literal(""), z.string()]).optional(),
  })
]);

type FormData = z.infer<typeof OnboardingSchema>;
type Step = "ORG" | "BRANCH" | "OWNER" | "SCANNING" | "REVIEW" | "SUCCESS";

/* -------------------------
  Helpers
------------------------- */

function computePasswordStrength(pw?: string) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 25;
  if (/[A-Z]/.test(pw)) score += 20;
  if (/[0-9]/.test(pw)) score += 20;
  if (/[^A-Za-z0-9]/.test(pw)) score += 20;
  if (pw.length >= 12) score += 15;
  return Math.min(100, score);
}

function getStepStatus(idx: number, current: Step): "PENDING" | "ACTIVE" | "COMPLETE" {
  const order: Step[] = ["ORG", "BRANCH", "OWNER", "REVIEW", "SUCCESS"];
  const currIdx = order.indexOf(current === "SCANNING" ? "OWNER" : current);
  if (idx < currIdx || current === "SUCCESS") return "COMPLETE";
  if (idx === currIdx) return "ACTIVE";
  return "PENDING";
}

// Helper to decode JWT payload locally for UI Preview before backend transmission
function decodeJwtPayload(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

/* -------------------------
  Background Effect
------------------------- */

const AmbientBackground = () => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-slate-50/50">
    <div 
      className="absolute inset-0 z-0 opacity-[0.15]" 
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} 
    />
    <motion.div 
      animate={{ x: [0, 50, 0], y: [0, -30, 0] }} 
      transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-[120px]" 
    />
    <motion.div 
      animate={{ x: [0, -40, 0], y: [0, 40, 0] }} 
      transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-400/10 blur-[120px]" 
    />
  </div>
);

/* -------------------------
  Reusable UI Components
------------------------- */

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  errorId?: string;
  hint?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, id, errorId, hint, ...props }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-sm font-bold text-slate-700 block">{label}</label>
    <input
      id={id}
      aria-describedby={errorId}
      {...props}
      className="w-full px-4 py-3.5 bg-white/60 border border-slate-200/80 rounded-xl text-sm font-medium outline-none text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm disabled:opacity-50 disabled:bg-slate-100"
    />
    {hint && <div className="text-xs text-slate-400 font-medium pl-1">{hint}</div>}
  </div>
);

const FieldError: React.FC<{ id?: string; messages?: string[] }> = ({ id, messages }) => {
  if (!messages || messages.length === 0) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} 
      id={id} role="alert" 
      className="text-[13px] text-red-500 font-bold mt-1 pl-1 flex items-center gap-1.5"
    >
      <i className="bx bx-error-circle text-base" /> {messages[0]}
    </motion.div>
  );
};

const NavAction: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <motion.button
    whileHover={{ scale: disabled ? 1 : 1.01 }} whileTap={{ scale: disabled ? 1 : 0.98 }}
    onClick={onClick} disabled={disabled}
    className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
  >
    {label} <i className="bx bx-right-arrow-alt text-xl" />
  </motion.button>
);

const SecondaryAction: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <motion.button
    whileHover={{ scale: disabled ? 1 : 1.01 }} whileTap={{ scale: disabled ? 1 : 0.98 }}
    onClick={onClick} disabled={disabled}
    className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:border-slate-300 hover:bg-slate-50 shadow-sm disabled:opacity-40 transition-all"
  >
    {label}
  </motion.button>
);

const StepNode: React.FC<{ number: number; title: string; status: "PENDING" | "ACTIVE" | "COMPLETE"; isActive: boolean; value?: string; }> = ({ number, title, status, isActive, value }) => (
  <div className={`relative z-10 flex gap-4 items-start transition-all duration-500 ${status === "PENDING" ? "opacity-40" : "opacity-100"}`}>
    <motion.div
      layout
      className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border transition-all duration-300 ${
        status === "ACTIVE" ? "bg-blue-600 text-white border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] scale-110" : status === "COMPLETE" ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white/60 text-slate-400 border-slate-200"
      }`}
    >
      {status === "COMPLETE" ? <i className="bx bx-check text-xl" /> : number}
    </motion.div>
    <div className="pt-2 min-w-0">
      <h3 className={`text-sm font-black tracking-wide transition-colors ${isActive ? "text-slate-900" : "text-slate-500"}`}>{title}</h3>
      <AnimatePresence>
        {!isActive && value && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="text-[13px] font-bold text-blue-600 truncate w-48 mt-1">
            {value}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  </div>
);

/* -------------------------
  Main Page Component
------------------------- */

export default function OnboardingPage() {
  const router = useRouter();
  const { dispatch } = useAlerts();

  const [activeStep, setActiveStep] = useState<Step>("ORG");
  const [isDeploying, setIsDeploying] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [serverStaffCode, setServerStaffCode] = useState<string | null>(null);

  // Initial state properly synced to prevent React uncontrolled input warnings
  const [formData, setFormData] = useState<FormData>({
    orgName: "",
    branchName: "",
    branchLocation: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    authProvider: "credentials",
  });

  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const clientCooldownRef = useRef<number | null>(null);
  const deployTimeoutRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (serverError) setServerError(null);
  }, [formData, serverError]);

  useEffect(() => {
    return () => {
      if (deployTimeoutRef.current) window.clearTimeout(deployTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const isClientThrottled = () => {
    const now = Date.now();
    if (clientCooldownRef.current && now - clientCooldownRef.current < 15000) return true;
    clientCooldownRef.current = now;
    return false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlurValidate = (field?: keyof FormData) => {
    const result = OnboardingSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      if (field && fieldErrors[field]) {
        setClientErrors((prev) => ({ ...prev, [field]: fieldErrors[field] }));
      }
    } else {
      setClientErrors({});
    }
  };

  const handleStepBack = () => {
    const steps: Step[] = ["ORG", "BRANCH", "OWNER", "REVIEW"];
    const currentIndex = steps.indexOf(activeStep);
    if (currentIndex > 0) setActiveStep(steps[currentIndex - 1]);
  };

  const triggerScan = () => {
    setActiveStep("SCANNING");
    setTimeout(() => setActiveStep("REVIEW"), 1500);
  };

  const handleAuthModeToggle = (mode: "credentials" | "google") => {
    if (formData.authProvider === mode) return;
    
    setFormData((prev) => ({
      ...prev,
      authProvider: mode,
      ...(mode === "credentials" 
          ? { idToken: undefined, ownerPassword: "" } 
          : { ownerPassword: "" } // Kept as empty string to prevent React uncontrolled input errors
      )
    }));
  };

  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "OAuth Failed", message: "Failed to securely retrieve identity token." });
      return;
    }
    
    const token = credentialResponse.credential;
    const payload = decodeJwtPayload(token);
    
    if (!payload || !payload.email) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Corrupt Payload", message: "Google returned an invalid identity format." });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      authProvider: "google",
      idToken: token,
      ownerEmail: payload.email.toLowerCase(),
      ownerName: payload.name || "System Admin",
      ownerPassword: "", // Automatically ignored by the updated Zod schema
    }));

    dispatch?.({ kind: "TOAST", type: "SUCCESS", title: "OAuth Connected", message: `Identity linked: ${payload.email}` });
  };

  const previewStaffCode = useMemo(() => {
    const bb = formData.branchName ? formData.branchName.slice(0, 2).toUpperCase() : "HQ";
    return `STF-001-${bb}`;
  }, [formData.branchName]);

  const passwordStrength = useMemo(() => computePasswordStrength(formData.ownerPassword), [formData.ownerPassword]);
  const [showPassword, setShowPassword] = useState(false);

  const handleDeploy = async () => {
    if (isClientThrottled()) {
      dispatch?.({ kind: "TOAST", type: "WARNING", title: "Rate Limited", message: "Security cooldown active. Please wait a few seconds." });
      return;
    }

    // ⚡ THE FIX: Safe Parse now successfully filters fields based on the discriminated union
    const parsed = OnboardingSchema.safeParse(formData);
    if (!parsed.success) {
      setClientErrors(parsed.error.flatten().fieldErrors);
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Validation Error", message: "Please resolve the form errors before committing." });
      return;
    }

    setClientErrors({});
    setIsDeploying(true);
    setServerError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);

    try {
      const resp = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);
      const payload = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setIsDeploying(false);
        
        if (resp.status === 400 && payload.details) {
           setClientErrors(payload.details);
           dispatch?.({ kind: "TOAST", type: "ERROR", title: "Constraint Failure", message: "Ledger rejected the input format." });
           setActiveStep("OWNER"); 
           return;
        }

        if (resp.status === 409) {
           setClientErrors({ ownerEmail: [payload.error || "Conflict detected."] });
           setServerError("Network Conflict: This identity is already mapped to an existing organization.");
           setActiveStep("OWNER");
           return;
        }

        const msg = payload?.error || "Provisioning Fault: Critical Ledger Failure.";
        setServerError(msg);
        dispatch?.({ kind: "TOAST", type: "ERROR", title: "Deployment Error", message: msg });
        return;
      }

      const staffCode = payload?.data?.staffCode;
      setServerStaffCode(staffCode);
      
      dispatch?.({ kind: "PUSH", type: "SUCCESS", title: "Identity Provisioned", message: `Admin Code: ${staffCode}` });
      setActiveStep("SUCCESS");

      deployTimeoutRef.current = window.setTimeout(() => router.push("/login?onboarded=true"), 5000);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Gateway Timeout: Ledger took too long to respond." : "Network Fault: Connection interrupted.";
      setServerError(msg);
      setIsDeploying(false);
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Connection Error", message: msg });
    }
  };

  const stepsList = [
    { title: "Organization", value: formData.orgName },
    { title: "Root Branch", value: formData.branchName },
    { title: "Security Admin", value: formData.ownerEmail },
    { title: "Deployment" },
  ];

return (
    <div className="flex h-screen w-full overflow-hidden text-slate-900 font-sans select-none relative bg-[#F8FAFC]">
      <AmbientBackground />
      
      <AnimatePresence>
        {["BRANCH", "OWNER", "REVIEW"].includes(activeStep) && (
          <motion.button
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            onClick={handleStepBack}
            className="fixed top-8 left-8 z-50 flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-all group font-bold"
          >
            <i className="bx bx-left-arrow-alt text-xl group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] uppercase tracking-widest pt-0.5">Return</span>
          </motion.button>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex lg:flex-col z-10 lg:w-[420px] border-r border-slate-200/50 bg-white/40 backdrop-blur-3xl p-12 gap-12">
        <div className="pt-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black">M</div>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Fortress Core v2.0</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Provisioning</h1>
          <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">Configuring atomic ledger nodes and root administrative identity.</p>
        </div>

        <div className="relative space-y-12 pl-2">
          <div className="absolute left-[19px] top-4 bottom-10 w-[2px] bg-slate-200/60 z-0" />
          {stepsList.map((s, i) => (
            <StepNode key={i} number={i + 1} title={s.title} status={getStepStatus(i, activeStep)} isActive={getStepStatus(i, activeStep) === "ACTIVE"} value={s.value} />
          ))}
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col items-center justify-center p-6 z-10 overflow-hidden">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {activeStep === "ORG" && (
              <FormBox key="org" title="Entity Registration" desc="Define the top-level legal identity for the MASA ecosystem.">
                <InputField
                  id="orgName" label="Legal Organization Name" name="orgName"
                  value={formData.orgName} onChange={handleChange} onBlur={() => handleBlurValidate("orgName")}
                  placeholder="e.g. Acme Holdings Ltd" errorId="err-orgName"
                />
                <FieldError id="err-orgName" messages={clientErrors.orgName} />
                <div className="pt-4">
                  <NavAction label="Next: Branch Configuration" onClick={() => setActiveStep("BRANCH")} disabled={!formData.orgName || formData.orgName.length < 2} />
                </div>
              </FormBox>
            )}

            {activeStep === "BRANCH" && (
              <FormBox key="branch" title="HQ Node Setup" desc="Establish the primary operating branch for this organization.">
                <InputField
                  id="branchName" label="Branch Alias" name="branchName"
                  value={formData.branchName} onChange={handleChange} onBlur={() => handleBlurValidate("branchName")}
                  placeholder="e.g. Lagos Headquarters"
                />
                <FieldError id="err-branchName" messages={clientErrors.branchName} />
                <InputField
                  id="branchLocation" label="Physical Address (Optional)" name="branchLocation"
                  value={formData.branchLocation ?? ""} onChange={handleChange}
                  placeholder="City, State"
                />
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <SecondaryAction label="Back" onClick={handleStepBack} />
                  <NavAction label="Assign Node" onClick={() => setActiveStep("OWNER")} disabled={!formData.branchName || formData.branchName.length < 2} />
                </div>
              </FormBox>
            )}

            {activeStep === "OWNER" && (
              <FormBox key="owner" title="Security Root" desc="Establish the master administrator for this environment.">
                
                {/* OAUTH INTEGRATION TOGGLE */}
                <div className="flex bg-slate-100/80 p-1.5 rounded-xl mb-6">
                  <button 
                    type="button"
                    onClick={() => handleAuthModeToggle("credentials")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${formData.authProvider === "credentials" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Password Base
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleAuthModeToggle("google")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${formData.authProvider === "google" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    <i className="bx bxl-google" /> SSO Link
                  </button>
                </div>

                <div className="space-y-4">
                  {/* ONLY show standard inputs if using credentials flow */}
                  <AnimatePresence mode="popLayout">
                    {formData.authProvider === "credentials" && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                        <InputField
                          id="ownerName" label="Full Legal Name" name="ownerName"
                          value={formData.ownerName || ""} onChange={handleChange}
                          placeholder="John Doe" 
                        />
                        <InputField
                          id="ownerEmail" label="Root Identity Email" name="ownerEmail" type="email"
                          value={formData.ownerEmail || ""} onChange={handleChange}
                          placeholder="admin@masa.io" errorId="err-email" 
                        />
                        <FieldError id="err-email" messages={clientErrors.ownerEmail} />

                        <div className="space-y-1.5 pt-2">
                          <label className="text-sm font-bold text-slate-700 block">System Password</label>
                          <div className="relative">
                            <input
                              name="ownerPassword" type={showPassword ? "text" : "password"}
                              value={formData.ownerPassword || ""} onChange={handleChange} onBlur={() => handleBlurValidate("ownerPassword")}
                              className="w-full px-4 py-3.5 bg-white/60 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 shadow-sm"
                              placeholder="••••••••"
                            />
                            <button 
                              type="button" onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-3 text-[10px] font-black uppercase text-slate-400"
                            >
                              {showPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                          <FieldError messages={clientErrors.ownerPassword} />
                          <div className="h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }} animate={{ width: `${passwordStrength}%` }}
                              className={`h-full ${passwordStrength > 70 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Show Google SSO Interface if Google is selected */}
                    {formData.authProvider === "google" && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                        
                        {!formData.idToken ? (
                          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200 rounded-xl gap-4">
                            <p className="text-xs font-bold text-slate-500 text-center px-4">
                              Click below to securely map your identity via Google Workspace.
                            </p>
                            <GoogleLogin
                              onSuccess={handleGoogleSuccess}
                              onError={() => dispatch?.({ kind: "TOAST", type: "ERROR", title: "OAuth Aborted", message: "Google Sign-In was closed or failed." })}
                              theme="outline"
                              size="large"
                              text="continue_with"
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 relative">
                            <i className="bx bxs-shield-check text-blue-600 text-2xl mt-0.5" />
                            <div className="flex-1">
                              <p className="text-xs font-bold text-blue-800 leading-relaxed mb-1">
                                OAuth delegation active.
                              </p>
                              <p className="text-[14px] font-black text-slate-900">
                                {formData.ownerName || "Administrator"} <span className="text-slate-500 font-medium ml-1">({formData.ownerEmail})</span>
                              </p>
                            </div>
                            <button 
                              type="button"
                              onClick={() => setFormData(p => ({ ...p, idToken: undefined, ownerEmail: "", ownerName: "" }))}
                              className="absolute right-3 top-3 text-[10px] uppercase font-bold text-slate-400 hover:text-red-500 transition-colors"
                            >
                              Reset
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer mt-4 hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 accent-slate-900" />
                  <span className="text-[12px] font-semibold text-slate-600 leading-relaxed">
                    I acknowledge that this account will have full 'ADMIN' privileges and is recorded in the immutable audit trail.
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <SecondaryAction label="Back" onClick={handleStepBack} />
                  <NavAction 
                    label="Review Ledger" 
                    onClick={triggerScan} 
                    disabled={
                      !agreedToTerms || 
                      (formData.authProvider === 'credentials' && (!formData.ownerName || !formData.ownerEmail || passwordStrength < 50)) ||
                      (formData.authProvider === 'google' && !formData.idToken)
                    } 
                  />
                </div>
              </FormBox>
            )}

            {activeStep === "SCANNING" && (
              <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center p-12 bg-white/80 rounded-[2.5rem] shadow-xl">
                <div className="relative w-20 h-20 mb-8">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-4 border-slate-100 border-t-blue-600 rounded-full" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <i className="bx bx-shield-alt-2 text-3xl text-blue-600" />
                  </div>
                </div>
                <h2 className="text-lg font-black text-slate-900 mb-2">Validating Schemata</h2>
                <p className="text-sm text-slate-500">Checking domain constraints & mapping relation integrity...</p>
              </motion.div>
            )}

            {activeStep === "REVIEW" && (
              <FormBox key="review" title="Commit Manifest" desc="Verify architectural constraints before final deployment.">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden mb-6">
                  <ReviewItem label="Entity" value={formData.orgName} />
                  <ReviewItem label="Root Node" value={formData.branchName} />
                  <ReviewItem label="Security Root" value={formData.ownerEmail || ""} />
                  <ReviewItem label="Auth Layer" value={formData.authProvider === 'google' ? "Google Workspace SSO" : "Local Hash Protocol"} />
                  <ReviewItem label="Projected ID" value={previewStaffCode} highlight />
                </div>

                {serverError && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 border border-red-200 text-red-600 text-[13px] font-bold rounded-xl mb-6 flex items-center gap-2">
                    <i className="bx bx-error-circle text-lg" /> {serverError}
                  </motion.div>
                )}

                <motion.button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-900/10 disabled:opacity-50"
                >
                  {isDeploying ? <><i className="bx bx-loader-alt animate-spin text-lg" /> Processing...</> : <><i className="bx bx-bolt-circle text-lg" /> Commit Infrastructure</>}
                </motion.button>
              </FormBox>
            )}

            {activeStep === "SUCCESS" && (
              <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-12 rounded-[3rem] shadow-2xl text-center border border-emerald-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <i className="bx bx-check-shield text-4xl" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-3">System Online</h2>
                <p className="text-sm text-slate-500 mb-8">Base infrastructure provisioned. Your admin account is now active in the Fortress ledger.</p>
                
                <div className="bg-slate-50 p-6 rounded-2xl mb-8 border border-slate-100 shadow-inner">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Primary Login Code</span>
                  <span className="text-3xl font-mono font-bold text-slate-900">{serverStaffCode || previewStaffCode}</span>
                </div>

                <SecondaryAction label="Enter Workspace" onClick={() => router.push("/login?onboarded=true")} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

const FormBox: React.FC<{ children: React.ReactNode; title: string; desc: string }> = ({ children, title, desc }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-white/70 backdrop-blur-2xl border border-white p-10 rounded-[2.5rem] shadow-xl w-full">
    <div className="mb-10">
      <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      <p className="text-sm font-medium text-slate-500 mt-2 leading-relaxed">{desc}</p>
    </div>
    <div className="space-y-6">{children}</div>
  </motion.div>
);

const ReviewItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between p-4.5 px-6">
    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{label}</span>
    <span className={`text-sm font-bold ${highlight ? 'text-blue-600 bg-blue-50 px-3 py-1 rounded-lg shadow-sm border border-blue-100' : 'text-slate-700'}`}>{value}</span>
  </div>
);