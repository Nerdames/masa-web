"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAlerts } from "@/components/feedback/AlertProvider"; // Adjust if your path is different

type Step = "ORG" | "BRANCH" | "OWNER" | "SCANNING" | "REVIEW" | "SUCCESS";

export default function OnboardingPage() {
  const router = useRouter();
  const { dispatch } = useAlerts();

  const [activeStep, setActiveStep] = useState<Step>("ORG");
  const [isDeploying, setIsDeploying] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [formData, setFormData] = useState({
    orgName: "",
    branchName: "",
    branchLocation: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleStepBack = () => {
    const steps: Step[] = ["ORG", "BRANCH", "OWNER", "REVIEW"];
    const currentIndex = steps.indexOf(activeStep);
    if (currentIndex > 0) setActiveStep(steps[currentIndex - 1]);
  };

  const triggerScan = () => {
    setActiveStep("SCANNING");
    setTimeout(() => setActiveStep("REVIEW"), 1800);
  };

  // UI Preview logic only - backend generates the authoritative code
  const previewStaffCode = useMemo(() => {
    const bb = formData.branchName
      ? formData.branchName.slice(0, 2).toUpperCase()
      : "HQ";
    return `STF-00101${bb}`;
  }, [formData.branchName]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const response = await fetch("/api/organizations/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Deployment failed.");

      dispatch({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Provisioning Complete",
        message: `${formData.orgName} is now active. Code: ${result.data.staffCode}`,
      });

      setActiveStep("SUCCESS");
      setTimeout(() => router.push("/dashboard"), 4000);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred.";
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Deployment Fault",
        message: errorMessage,
      });
      setIsDeploying(false);
    }
  };

  // Smart Visibility for the Return Button
  const showReturnButton = ["BRANCH", "OWNER", "REVIEW"].includes(activeStep);

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden text-slate-900 font-sans select-none relative">
      <style jsx global>{`
        ::-webkit-scrollbar {
          display: none;
        }
        * {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* --- SMART FIXED RETURN BUTTON --- */}
      <AnimatePresence>
        {showReturnButton && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onClick={handleStepBack}
            className="fixed top-10 left-10 z-50 flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md border border-slate-200 rounded-full shadow-sm hover:border-blue-500 hover:text-blue-600 transition-all group"
          >
            <i className="bx bx-left-arrow-alt text-xl" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Back
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* --- SIDEBAR: STATUS TRACKER --- */}
      <aside className="w-[380px] border-r border-slate-100 bg-[#F8FAFC] flex flex-col p-10 relative">
        <div className="mb-12 pt-12">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">
              Core Engine v3.1
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Provisioning
          </h1>
        </div>

        <div className="relative space-y-10">
          <div className="absolute left-[15px] top-2 bottom-2 w-[1px] bg-slate-200 z-0" />
          <StepNode
            number={1}
            title="Organization"
            status={getStepStatus(0, activeStep)}
            isActive={activeStep === "ORG"}
            value={formData.orgName}
          />
          <StepNode
            number={2}
            title="Headquarters"
            status={getStepStatus(1, activeStep)}
            isActive={activeStep === "BRANCH"}
            value={formData.branchName}
          />
          <StepNode
            number={3}
            title="Security Root"
            status={getStepStatus(2, activeStep)}
            isActive={activeStep === "OWNER"}
            value={formData.ownerEmail}
          />
          <StepNode
            number={4}
            title="Deployment"
            status={getStepStatus(3, activeStep)}
            isActive={activeStep === "REVIEW" || activeStep === "SUCCESS"}
          />
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col items-center justify-center p-12 bg-white">
        <div className="w-full max-w-sm relative z-10">
          <AnimatePresence mode="wait">
            {activeStep === "ORG" && (
              <FormBox
                key="org"
                title="Entity Profile"
                desc="Establish the primary legal identity."
              >
                <InputField
                  label="Organization Name"
                  name="orgName"
                  value={formData.orgName}
                  onChange={handleChange}
                  placeholder="e.g. Nexus Corp"
                />
                <NavAction
                  label="Continue"
                  onClick={() => setActiveStep("BRANCH")}
                  disabled={!formData.orgName}
                />
              </FormBox>
            )}

            {activeStep === "BRANCH" && (
              <FormBox
                key="branch"
                title="HQ Node"
                desc="Configure the root operating branch."
              >
                <InputField
                  label="Branch Name"
                  name="branchName"
                  value={formData.branchName}
                  onChange={handleChange}
                  placeholder="Main Office"
                />
                <InputField
                  label="Physical Location"
                  name="branchLocation"
                  value={formData.branchLocation}
                  onChange={handleChange}
                  placeholder="City, Country"
                />
                <NavAction
                  label="Assign Node"
                  onClick={() => setActiveStep("OWNER")}
                  disabled={!formData.branchName}
                />
              </FormBox>
            )}

            {activeStep === "OWNER" && (
              <FormBox
                key="owner"
                title="Root Admin"
                desc="Finalize administrative credentials."
              >
                <InputField
                  label="Full Name"
                  name="ownerName"
                  value={formData.ownerName}
                  onChange={handleChange}
                  placeholder="Administrator"
                />
                <InputField
                  label="Root Email"
                  name="ownerEmail"
                  value={formData.ownerEmail}
                  onChange={handleChange}
                  type="email"
                />
                <InputField
                  label="System Password"
                  name="ownerPassword"
                  value={formData.ownerPassword}
                  onChange={handleChange}
                  type="password"
                />
                <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-[11px] text-slate-500 leading-relaxed">
                    I assume responsibility for this root administrative account.
                  </span>
                </label>
                <NavAction
                  label="Validate Logic"
                  onClick={triggerScan}
                  disabled={!formData.ownerPassword || !agreedToTerms}
                />
              </FormBox>
            )}

            {activeStep === "SCANNING" && (
              <motion.div
                key="scan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 border-2 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-4" />
                <h2 className="text-[10px] font-black tracking-[0.3em] uppercase text-slate-400">
                  Verifying...
                </h2>
              </motion.div>
            )}

            {activeStep === "REVIEW" && (
              <FormBox
                key="review"
                title="Manifest"
                desc="Final architectural review."
              >
                <div className="bg-slate-50 border border-slate-100 rounded-2xl divide-y divide-slate-200/50 mb-6">
                  <ReviewLine label="Entity" value={formData.orgName} />
                  <ReviewLine label="Root Node" value={formData.branchName} />
                  <ReviewLine label="Security" value={formData.ownerEmail} />
                  <ReviewLine label="Initial ID" value={previewStaffCode} highlight />
                </div>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isDeploying ? (
                    <i className="bx bx-loader-alt animate-spin" />
                  ) : (
                    "Commit Deployment"
                  )}
                </button>
              </FormBox>
            )}

            {activeStep === "SUCCESS" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl rotate-3">
                  <i className="bx bx-check text-5xl" />
                </div>
                <h2 className="text-2xl font-bold mb-2">System Online</h2>
                <p className="text-xs text-slate-500 mb-10">
                  Infrastructure provisioned. Redirecting...
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

/* --- FULLY TYPED UI HELPERS --- */

function getStepStatus(
  idx: number,
  current: Step
): "PENDING" | "ACTIVE" | "COMPLETE" {
  const order: Step[] = ["ORG", "BRANCH", "OWNER", "REVIEW", "SUCCESS"];
  const currIdx = order.indexOf(current === "SCANNING" ? "OWNER" : current);
  if (idx < currIdx || current === "SUCCESS") return "COMPLETE";
  if (idx === currIdx) return "ACTIVE";
  return "PENDING";
}

interface StepNodeProps {
  number: number;
  title: string;
  status: "PENDING" | "ACTIVE" | "COMPLETE";
  isActive: boolean;
  value?: string;
}

const StepNode: React.FC<StepNodeProps> = ({
  number,
  title,
  status,
  isActive,
  value,
}) => (
  <div
    className={`relative z-10 flex gap-5 transition-all duration-500 ${
      status === "PENDING" ? "opacity-30 scale-95" : "opacity-100 scale-100"
    }`}
  >
    <div
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold border transition-all duration-300 ${
        status === "ACTIVE"
          ? "bg-blue-600 text-white border-blue-400 shadow-[0_10px_20px_rgba(37,99,235,0.15)]"
          : status === "COMPLETE"
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-400 border-slate-200"
      }`}
    >
      {status === "COMPLETE" ? <i className="bx bx-check" /> : number}
    </div>
    <div className="pt-1">
      <h3
        className={`text-[11px] font-black tracking-widest uppercase ${
          isActive ? "text-slate-900" : "text-slate-400"
        }`}
      >
        {title}
      </h3>
      {!isActive && value && (
        <p className="text-[10px] font-bold text-blue-600 tracking-tight truncate w-44 mt-0.5">
          {value}
        </p>
      )}
    </div>
  </div>
);

interface FormBoxProps {
  children: React.ReactNode;
  title: string;
  desc: string;
}

const FormBox: React.FC<FormBoxProps> = ({ children, title, desc }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="space-y-8"
  >
    <div>
      <h2 className="text-3xl font-bold tracking-tight text-slate-900">
        {title}
      </h2>
      <p className="text-xs text-slate-500 mt-2">{desc}</p>
    </div>
    <div className="space-y-5">{children}</div>
  </motion.div>
);

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, ...props }) => (
  <div className="space-y-2">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
      {label}
    </label>
    <input
      {...props}
      className="w-full px-5 py-4 bg-slate-50 border border-slate-200/60 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5 transition-all"
    />
  </div>
);

interface NavActionProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const NavAction: React.FC<NavActionProps> = ({ label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 disabled:opacity-20 transition-all flex items-center justify-center gap-2"
  >
    {label} <i className="bx bx-right-arrow-alt text-lg" />
  </button>
);

interface ReviewLineProps {
  label: string;
  value?: string;
  highlight?: boolean;
}

const ReviewLine: React.FC<ReviewLineProps> = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between p-4 text-[11px]">
    <span className="font-black uppercase text-slate-400 tracking-widest">
      {label}
    </span>
    <span
      className={`font-bold ${highlight ? "text-blue-600" : "text-slate-700"}`}
    >
      {value || "..."}
    </span>
  </div>
);