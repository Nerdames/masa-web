import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
//  NEW (Updated to target the root app providers directory)
import { ClientWrappers } from "@/app/providers/ClientWrappers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "MASA v2.0 - Fortress",
  description: "Enterprise Resource Planning Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html 
      lang="en" 
      className="h-full overflow-hidden" 
      data-scroll-behavior="smooth"
      suppressHydrationWarning // Neutralizes extension attribute injections safely
    >
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