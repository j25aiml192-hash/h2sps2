/**
 * GET /api/health
 *
 * Returns live health + circuit-breaker status for all providers.
 * Also includes current rate-limit snapshots.
 */
import { NextResponse } from "next/server";
import { checkAllProviders, getProviderRateLimits } from "@/lib/ai-providers";

export const dynamic = "force-dynamic"; // always fresh

export async function GET() {
  try {
    const [providerHealth, rateLimits] = await Promise.all([
      checkAllProviders(),
      Promise.resolve(getProviderRateLimits()),
    ]);

    const allHealthy = Object.values(providerHealth).some((p) => p.healthy);

    return NextResponse.json(
      {
        status: allHealthy ? "ok" : "degraded",
        providers: providerHealth,
        rateLimits: Object.fromEntries(
          Object.entries(rateLimits).map(([k, v]) => [
            k,
            { remaining: v.remaining, resetAt: v.resetAt.toISOString() },
          ])
        ),
        timestamp: new Date().toISOString(),
      },
      { status: allHealthy ? 200 : 503 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
