"use client";

import React, { useState, FormEvent, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAlerts } from "@/components/feedback/AlertProvider";

// Extracted the core logic into a sub-component so we can wrap it in Suspense.
// This prevents Next.js from de-optimizing the entire page to client-side rendering
// because of the useSearchParams hook.
const SignInForm = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 1. Initialize the new real-time alert system
  const { dispatch } = useAlerts();

  const rawCallbackUrl = searchParams.get("callbackUrl");
  const errorParam = searchParams.get("error");

  const callbackUrl = (
    !rawCallbackUrl || 
    rawCallbackUrl === "/" || 
    rawCallbackUrl === "/auth/signin" || 
    rawCallbackUrl === "%2F"
  ) ? "/dashboard" : rawCallbackUrl;

  // 2. Handle forced logout / session expired / account status errors
  useEffect(() => {
    if (!errorParam) return;

    let message = "";
    if (errorParam === "SessionExpired") {
      message = "Your session has expired. Please sign in again.";
    } else if (errorParam === "disabled") {
      message = "Your account has been disabled. Contact your administrator.";
    } else if (errorParam === "locked") {
      message = "Your account is locked. Please contact your administrator.";
    }

    if (message) {
      // Dispatch using the new strict alert format
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Access Denied", 
        message 
      });

      const newUrl = window.location.pathname + 
        (rawCallbackUrl ? `?callbackUrl=${encodeURIComponent(rawCallbackUrl)}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, [errorParam, dispatch, rawCallbackUrl]);

  // 3. Handle form submission
  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password: password.trim(),
        callbackUrl,
      });

      if (result?.error) {
        let message = "Login failed. Please try again.";

        switch (result.error) {
          case "CredentialsSignin":
            message = "Invalid email or password.";
            break;
          case "disabled":
            message = "Your account has been disabled. Contact your administrator.";
            break;
          case "locked":
            message = "Your account is locked. Please contact your administrator.";
            break;
          case "temporary_lockout":
            message = "Too many failed attempts. Please try again after 15 minutes.";
            break;
        }

        dispatch({ 
          kind: "TOAST", 
          type: "ERROR", 
          title: "Authentication Failed", 
          message 
        });
      } else if (result?.ok) {
        dispatch({ 
          kind: "TOAST", 
          type: "INFO", 
          title: "Welcome Back", 
          message: "Signed in successfully!" 
        });
        
        router.replace(callbackUrl);
        router.refresh(); 
      }
    } catch (err: unknown) {
      console.error("SignIn Error:", err);
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "System Error",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xs p-6 bg-white rounded-xl shadow-lg space-y-4 relative z-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-center text-blue-700">
          Sign In to MASA
        </h1>
        <p className="text-center text-gray-500 text-sm">
          Enter your credentials to access your dashboard
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
        <div className="relative">
          <i className="bx bx-envelope absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm"
            required
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="relative">
          <i className="bx bx-lock-alt absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm"
            required
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            <i className={showPassword ? "bx bx-show" : "bx bx-hide"}></i>
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 text-sm font-medium rounded-lg transition flex items-center justify-center ${
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">
        Securely access your MASA dashboard and manage your organization seamlessly.
      </p>
    </div>
  );
};

const SignInPage: React.FC = () => {
  return (
    <main className="flex flex-col min-h-screen items-center justify-center px-4 relative">
      {/* Moved the background styling here to span the whole screen appropriately */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-green-50 -z-10" />
      
      {/* Wrapped in Suspense to safely useSearchParams without de-optimizing the build */}
      <Suspense fallback={
        <div className="w-full max-w-xs p-6 bg-white rounded-xl shadow-lg flex justify-center py-12">
           <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
        </div>
      }>
        <SignInForm />
      </Suspense>
    </main>
  );
};

export default SignInPage;