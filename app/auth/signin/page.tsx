"use client";

import React, { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider"; // your toast hook

const SignInPage: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const router = useRouter();
  const { addToast } = useToast();

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        let message = "";
        if (result.error === "CredentialsSignin") {
          message = "Invalid email or password";
        } else {
          message = result.error;
        }
        addToast({ message, type: "error" });
      } else if (result?.ok) {
        addToast({ message: "Signed in successfully!", type: "success" });
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
      addToast({ message: "Something went wrong. Please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-xs p-6 bg-white rounded-xl shadow-lg space-y-4">
        {/* Header */}
        <h1 className="text-2xl font-bold text-center text-gray-900">Sign In to MASA</h1>
        <p className="text-center text-gray-500 text-sm">
          Enter your credentials to access the dashboard
        </p>

        {/* Sign In form */}
        <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
          {/* Email Input */}
          <div className="relative">
            <i className="bx bx-envelope absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black w-full text-sm"
              required
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
              className="pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black w-full text-sm"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
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
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-black text-white hover:bg-gray-900"
            }`}
          >
            {loading ? (
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} MASA. All rights reserved.
        </p>
      </div>
    </main>
  );
};

export default SignInPage;
