/**
 * Google Analytics 4 — Script injector + event helpers
 * ══════════════════════════════════════════════════════
 * Include <GoogleAnalytics /> once in layout.tsx.
 * Use the `ga` helper anywhere for custom events.
 *
 * Required env var: NEXT_PUBLIC_GA_MEASUREMENT_ID (G-XXXXXXXXXX)
 *
 * Events tracked automatically:
 *   - page_view (Next.js route changes)
 *   - debate_started
 *   - debate_completed
 *   - news_pipeline_run
 *   - voice_session
 *   - provider_switch  (AI fallback events)
 */
"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

// ── Type-safe gtag wrapper ────────────────────────────────────
type GTagCommand = "config" | "event" | "js" | "set";

function gtag(command: GTagCommand, target: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.dataLayer = w.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  w.gtag = w.gtag ?? function(...args: unknown[]) { w.dataLayer.push(args); };
  if (params) w.gtag(command, target, params);
  else w.gtag(command, target);
}

// ── Public event helper ───────────────────────────────────────
export function ga(eventName: string, params?: Record<string, unknown>) {
  if (!GA_ID) return;
  gtag("event", eventName, params);
}

// ── Predefined events ─────────────────────────────────────────
export const gaEvents = {
  debateStarted:      (topic: string) => ga("debate_started",      { debate_topic: topic }),
  debateCompleted:    (topic: string, agents: number) => ga("debate_completed", { debate_topic: topic, agent_count: agents }),
  newsProcessed:      (count: number, source: string) => ga("news_pipeline_run", { article_count: count, news_source: source }),
  voiceSession:       (provider: string) => ga("voice_session",    { stt_provider: provider }),
  providerSwitch:     (from: string, to: string) => ga("provider_switch", { from_provider: from, to_provider: to }),
  login:              (method: string) => ga("login",              { method }),
  civicSearch:        (address: string) => ga("civic_search",     { search_address: address }),
  translationUsed:    (langPair: string) => ga("translation_used", { language_pair: langPair }),
  exportUsed:         (format: string) => ga("export_used",       { export_format: format }),
};

// ── Route-change page view tracking ──────────────────────────
function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_ID) return;
    gtag("config", GA_ID, { page_path: pathname });
  }, [pathname]);

  return null;
}

// ── Script component (add to layout.tsx) ─────────────────────
export function GoogleAnalytics() {
  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      <PageViewTracker />
    </>
  );
}
