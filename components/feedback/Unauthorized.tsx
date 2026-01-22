"use client";

import Link from "next/link";
import { JSX } from "react";

export default function Unauthorized(): JSX.Element {
  return (
    <main className="flex flex-col min-h-screen bg-white text-black">
      {/* Centered content */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center space-y-6">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-3">
          <i className="bx bx-lock text-6xl text-red-500"></i>
          <h1 className="text-4xl font-extrabold text-gray-900">Unauthorized</h1>
        </div>

        {/* Message */}
        <p className="text-lg text-gray-600 max-w-xl">
          You do not have permission to access this page. Please sign in with an authorized account.
        </p>

        {/* CTA button */}
        <Link
          href="/auth/signin"
          className="flex items-center gap-2 px-6 py-3 rounded-md border border-gray-400 text-gray-700 hover:bg-[#F2F2F3] transition-all duration-300"
        >
          <i className="bx bx-log-in text-xl"></i>
          Sign In
        </Link>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-gray-500 py-4">
        © {new Date().getFullYear()} MASA. All rights reserved.
      </footer>
    </main>
  );
}
