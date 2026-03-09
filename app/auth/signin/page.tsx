"use client";

import React, { useState, FormEvent, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";

const SignInPage: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  // 1. Extract and sanitize callbackUrl
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const errorParam = searchParams.get("error");

  // If callback is empty, root, or points back to signin, default to dashboard
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
      addToast({ message, type: "error" });

      // Clean the URL: remove the error param so it doesn't toast again on refresh
      const newUrl = window.location.pathname + 
        (rawCallbackUrl ? `?callbackUrl=${encodeURIComponent(rawCallbackUrl)}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, [errorParam, addToast, rawCallbackUrl]);

  // 3. Handle form submission
  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false, // Handle redirect manually to control UX
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

        addToast({ message, type: "error" });
      } else if (result?.ok) {
        addToast({ message: "Signed in successfully!", type: "success" });
        // Use replace to prevent the user from clicking "Back" into the login form
        router.replace(callbackUrl);
        router.refresh(); // Ensure the server-side components recognize the new session
      }
    } catch (err) {
      console.error("SignIn Error:", err);
      addToast({
        message: "Something went wrong. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50 px-4">
      <div className="w-full max-w-xs p-6 bg-white rounded-xl shadow-lg space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-center text-green-700">
            Sign In to MASA
          </h1>
          <p className="text-center text-gray-500 text-sm">
            Enter your credentials to access your dashboard
          </p>
        </div>

        {/* Form */}
        <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
          {/* Email Input */}
          <div className="relative">
            <i className="bx bx-envelope absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-700 w-full text-sm"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <i className="bx bx-lock-alt absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-700 w-full text-sm"
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

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 text-sm font-medium rounded-lg transition flex items-center justify-center ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-700 text-white hover:bg-green-800"
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Securely access your MASA dashboard and manage your organization seamlessly.
        </p>
      </div>
    </main>
  );
};

export default SignInPage;