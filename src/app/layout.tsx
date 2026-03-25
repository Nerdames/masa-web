// src/app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
import "boxicons/css/boxicons.min.css";
import "./globals.css";
import { ClientWrappers } from "@/core/providers/ClientWrappers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "MASA v3.0",
  description: "Enterprise Resource Planning Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth h-full overflow-hidden">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-dvh w-full overflow-hidden bg-gradient-to-br from-blue-50 via-white to-green-50 text-black flex flex-col`}>
        <ClientWrappers>{children}</ClientWrappers>
      </body>
    </html>
  );
}