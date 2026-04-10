import { Geist, Geist_Mono } from "next/font/google";
import "boxicons/css/boxicons.min.css";
import "./globals.css";
import { ClientWrappers } from "@/core/providers/ClientWrappers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "MASA v2.0 - Fortress",
  description: "Enterprise Resource Planning Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth h-full overflow-hidden">
      {/* 1. Removed the hardcoded blue-to-green gradient.
          2. Added 'bg-slate-50' as a base fallback.
          3. Ensure h-dvh (dynamic viewport height) is locked to prevent mobile browser chrome jumps.
      */}
      <body 
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-dvh w-full overflow-hidden bg-slate-50 text-black flex flex-col`}
      >
        <ClientWrappers>
          {children}
        </ClientWrappers>
      </body>
    </html>
  );
}