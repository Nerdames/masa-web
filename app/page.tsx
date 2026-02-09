"use client";

import Link from "next/link";
import { JSX } from "react";

export default function Home(): JSX.Element {
  return (
    <main className="flex flex-col min-h-screen bg-babyBlue text-ebony">
      {/* Centered hero section */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center space-y-6">
        {/* Logo + brand */}
        <div className="flex items-center gap-3">
          <i className="bx bx-dashboard text-6xl text-forest"></i>
          <span className="text-5xl font-extrabold tracking-wide text-forest">MASA</span>
        </div>

        {/* Tagline */}
        <p className="text-lg text-ebony/70 max-w-xl">
          Integrated Management, Sales & Administration
        </p>

        {/* CTA button */}
        <div className="flex gap-6">
          <Link
            href="/auth/signin"
            className="flex items-center gap-2 px-6 py-3 rounded-md border border-forest text-forest hover:bg-green transition-all duration-300"
          >
            <i className="bx bx-log-in text-xl"></i>
            Sign In
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-ebony/70 py-4">
        © {new Date().getFullYear()} MASA. All rights reserved.
      </footer>
    </main>
  );
}
