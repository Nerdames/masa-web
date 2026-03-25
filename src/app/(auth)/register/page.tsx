"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
  Schema & Types
------------------------- */

// Aligned with AuthorizedPersonnel, Organization, and Branch models
const OnboardingSchema = z.object({
  orgName: z.string().min(2, "Organization name is too short").max(120),
  branchName: z.string().min(2, "Branch name is too short").max(120),
  branchLocation: z.string().max(200).optional().nullable(),
  ownerName: z.string().min(2, "Administrator name is required"),
  ownerEmail: z.string().email("Invalid email format"),
  ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
  // Internal flags for the onboarding route to handle role assignment
  role: z.string().default("ADMIN"),
  isOrgOwner: z.boolean().default(true),
});

type FormData = z.infer<typeof OnboardingSchema>;
type Step = "ORG" | "BRANCH" | "OWNER" | "SCANNING" | "REVIEW" | "SUCCESS";

/* -------------------------
  Helpers
------------------------- */

function computePasswordStrength(pw: string) {
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

/* -------------------------
  Background Effect
------------------------- */

const AmbientBackground = () => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-slate-50/50">
    <div 
      className="absolute inset-0 z-0 opacity-[0.15]" 
      style={{ 
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
      }} 
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
  Reusable UI
------------------------- */

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  errorId?: string;
  hint?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, id, errorId, hint, ...props }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-sm font-bold text-slate-700 block">
      {label}
    </label>
    <input
      id={id}
      aria-describedby={errorId}
      {...props}
      className="w-full px-4 py-3.5 bg-white/60 border border-slate-200/80 rounded-xl text-sm font-medium outline-none text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
    />
    {hint && <div className="text-xs text-slate-400 font-medium pl-1">{hint}</div>}
  </div>
);

const FieldError: React.FC<{ id?: string; messages?: string[] }> = ({ id, messages }) => {
  if (!messages || messages.length === 0) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }} 
      animate={{ opacity: 1, height: "auto" }} 
      id={id} 
      role="alert" 
      className="text-[13px] text-red-500 font-bold mt-1 pl-1 flex items-center gap-1.5"
    >
      <i className="bx bx-error-circle text-base" />
      {messages[0]}
    </motion.div>
  );
};

const NavAction: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <motion.button
    whileHover={{ scale: disabled ? 1 : 1.01 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
    onClick={onClick}
    disabled={disabled}
    className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
  >
    {label} <i className="bx bx-right-arrow-alt text-xl" />
  </motion.button>
);

const SecondaryAction: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <motion.button
    whileHover={{ scale: disabled ? 1 : 1.01 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
    onClick={onClick}
    disabled={disabled}
    className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:border-slate-300 hover:bg-slate-50 shadow-sm disabled:opacity-40 transition-all"
  >
    {label}
  </motion.button>
);

const StepNode: React.FC<{
  number: number;
  title: string;
  status: "PENDING" | "ACTIVE" | "COMPLETE";
  isActive: boolean;
  value?: string;
}> = ({ number, title, status, isActive, value }) => (
  <div
    className={`relative z-10 flex gap-4 items-start transition-all duration-500 ${
      status === "PENDING" ? "opacity-40" : "opacity-100"
    }`}
  >
    <motion.div
      layout
      className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border transition-all duration-300 ${
        status === "ACTIVE"
          ? "bg-blue-600 text-white border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] scale-110"
          : status === "COMPLETE"
          ? "bg-slate-900 text-white border-slate-900 shadow-md"
          : "bg-white/60 text-slate-400 border-slate-200"
      }`}
    >
      {status === "COMPLETE" ? <i className="bx bx-check text-xl" /> : number}
    </motion.div>
    <div className="pt-2 min-w-0">
      <h3 className={`text-sm font-black tracking-wide transition-colors ${isActive ? "text-slate-900" : "text-slate-500"}`}>
        {title}
      </h3>
      <AnimatePresence>
        {!isActive && value && (
          <motion.p 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: "auto" }}
            className="text-[13px] font-bold text-blue-600 truncate w-48 mt-1"
          >
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

  const [formData, setFormData] = useState<FormData>({
    orgName: "",
    branchName: "",
    branchLocation: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    role: "ADMIN",
    isOrgOwner: true,
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
    if (clientCooldownRef.current && now - clientCooldownRef.current < 30000) return true;
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
      setClientErrors(fieldErrors);
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

  const previewStaffCode = useMemo(() => {
    const bb = formData.branchName ? formData.branchName.slice(0, 2).toUpperCase() : "HQ";
    return `STF-1001-${bb}`;
  }, [formData.branchName]);

  const passwordStrength = useMemo(() => computePasswordStrength(formData.ownerPassword), [formData.ownerPassword]);
  const [showPassword, setShowPassword] = useState(false);

  const handleDeploy = async () => {
    if (isClientThrottled()) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Rate Limited", message: "Security cooldown active. Please wait." });
      return;
    }

    const parsed = OnboardingSchema.safeParse(formData);
    if (!parsed.success) {
      setClientErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    setClientErrors({});
    setIsDeploying(true);
    setServerError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);

    try {
      const resp = await fetch("/api/organizations/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);
      const payload = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = payload?.error || "Provisioning Fault: Critical Ledger Failure.";
        setServerError(msg);
        dispatch?.({ kind: "TOAST", type: "ERROR", title: "Deployment Error", message: msg });
        setIsDeploying(false);
        return;
      }

      // Aligned with Prisma AuthorizedPersonnel staffCode 
      const staffCode = payload?.data?.staffCode;
      setServerStaffCode(staffCode);
      
      dispatch?.({ kind: "PUSH", type: "SUCCESS", title: "Identity Provisioned", message: `Admin Code: ${staffCode}` });
      setActiveStep("SUCCESS");

      // Post-deployment: User is now ready for NextAuth session
      deployTimeoutRef.current = window.setTimeout(() => router.push("/login?onboarded=true"), 5000);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Provisioning Timeout." : "Network/Logic Fault.";
      setServerError(msg);
      setIsDeploying(false);
    }
  };

  const stepsList: { title: string; value?: string }[] = [
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
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={handleStepBack}
            className="fixed top-8 left-8 z-50 flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-all group font-bold"
          >
            <i className="bx bx-left-arrow-alt text-xl group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] uppercase tracking-widest pt-0.5">Return</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
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
            <StepNode
              key={i}
              number={i + 1}
              title={s.title}
              status={getStepStatus(i, activeStep)}
              isActive={getStepStatus(i, activeStep) === "ACTIVE"}
              value={s.value}
            />
          ))}
        </div>
      </aside>

      {/* Main Form Area */}
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
                  <NavAction label="Assign Node" onClick={() => setActiveStep("OWNER")} disabled={!formData.branchName} />
                </div>
              </FormBox>
            )}

            {activeStep === "OWNER" && (
              <FormBox key="owner" title="Security Root" desc="Establish the master administrator for this environment.">
                <div className="space-y-4">
                  <InputField
                    id="ownerName" label="Full Legal Name" name="ownerName"
                    value={formData.ownerName} onChange={handleChange}
                    placeholder="John Doe"
                  />
                  <InputField
                    id="ownerEmail" label="Root Identity Email" name="ownerEmail" type="email"
                    value={formData.ownerEmail} onChange={handleChange}
                    placeholder="admin@masa.io"
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 block">System Password</label>
                    <div className="relative">
                      <input
                        name="ownerPassword" type={showPassword ? "text" : "password"}
                        value={formData.ownerPassword} onChange={handleChange}
                        className="w-full px-4 py-3.5 bg-white/60 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 shadow-sm"
                        placeholder="••••••••"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-[10px] font-black uppercase text-slate-400"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${passwordStrength}%` }}
                        className={`h-full ${passwordStrength > 70 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      />
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer mt-4">
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1" />
                  <span className="text-[12px] font-semibold text-slate-600 leading-relaxed">
                    I acknowledge that this account will have full 'ADMIN' privileges and is recorded in the immutable audit trail.
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <SecondaryAction label="Back" onClick={handleStepBack} />
                  <NavAction label="Review Ledger" onClick={triggerScan} disabled={!agreedToTerms || passwordStrength < 50} />
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
                <p className="text-sm text-slate-500">Checking domain constraints & relation integrity...</p>
              </motion.div>
            )}

            {activeStep === "REVIEW" && (
              <FormBox key="review" title="Commit Manifest" desc="Verify architectural constraints before final deployment.">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden mb-6">
                  <ReviewItem label="Entity" value={formData.orgName} />
                  <ReviewItem label="Root Node" value={formData.branchName} />
                  <ReviewItem label="Security" value={formData.ownerEmail} />
                  <ReviewItem label="Projected ID" value={previewStaffCode} highlight />
                </div>

                {serverError && <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl mb-6">{serverError}</div>}

                <motion.button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-900/10"
                >
                  {isDeploying ? <><i className="bx bx-loader-alt animate-spin" /> Provisioning...</> : <><i className="bx bx-bolt-circle" /> Commit Infrastructure</>}
                </motion.button>
              </FormBox>
            )}

            {activeStep === "SUCCESS" && (
              <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-12 rounded-[3rem] shadow-2xl text-center border border-emerald-100">
                <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-500/20">
                  <i className="bx bx-check text-4xl" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-3">System Online</h2>
                <p className="text-sm text-slate-500 mb-8">Base infrastructure provisioned. Your admin account is now active in the Fortress ledger.</p>
                
                <div className="bg-slate-50 p-6 rounded-2xl mb-8 border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Primary Login Code</span>
                  <span className="text-2xl font-mono font-bold text-slate-900">{serverStaffCode || previewStaffCode}</span>
                </div>

                <SecondaryAction label="Enter Workspace" onClick={() => router.push("/signin")} />
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
    <span className={`text-sm font-bold ${highlight ? 'text-blue-600 bg-blue-50 px-3 py-1 rounded-lg' : 'text-slate-700'}`}>{value}</span>
  </div>
);