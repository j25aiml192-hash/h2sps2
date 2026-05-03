import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta" });

export const metadata: Metadata = {
  title: {
    default:  "Multi-Model AI Hub",
    template: "%s | AI Hub",
  },
  description:
    "Production-grade multi-model AI platform with debate agents, news pipeline, voice interface, and governance analytics.",
  keywords: ["AI", "debate", "governance", "Gemini", "Groq", "news", "voice"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className="bg-canvas text-ink antialiased">
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
