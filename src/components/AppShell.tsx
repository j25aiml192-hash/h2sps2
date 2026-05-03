"use client";

import { MessageSquare, Newspaper, Brain } from "lucide-react";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",       label: "AI Assistant",      icon: <Brain size={13} /> },
  { href: "/debate", label: "Policy Simulator",  icon: <MessageSquare size={13} /> },
  { href: "/news",   label: "Intelligence Feed", icon: <Newspaper size={13} /> },
];

interface AppShellProps {
  children: React.ReactNode;
  /** Optional subtitle shown under the logo */
  subtitle?: string;
  /** Optional right-side slot (e.g. health pills) */
  headerRight?: React.ReactNode;
}

export function AppShell({ children, subtitle = "Governance Intelligence", headerRight }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      <header className="border-b border-hairline bg-canvas/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between gap-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary text-body-sm font-bold">
              N
            </div>
            <div>
              <p className="text-body-sm font-semibold leading-tight">NitiYantra</p>
              <p className="text-caption text-ink-muted">{subtitle}</p>
            </div>
          </a>

          {/* Optional centre slot */}
          {headerRight && (
            <div className="flex-1 flex justify-center overflow-x-auto">
              {headerRight}
            </div>
          )}

          {/* Nav */}
          <nav className="flex items-center gap-0.5 shrink-0">
            {NAV.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <a key={href} href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-caption border transition-all ${
                    active
                      ? "bg-surface-2 text-ink border-hairline font-medium"
                      : "text-ink-muted border-transparent hover:text-ink hover:bg-surface-1 hover:border-hairline"
                  }`}>
                  {icon}
                  <span className="hidden lg:inline">{label}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
