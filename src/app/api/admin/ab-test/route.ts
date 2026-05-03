/**
 * /api/admin/ab-test
 * ───────────────────
 * GET  — list all experiments
 * POST — create a new experiment
 * PATCH — conclude experiment (pick winner)
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createExperiment, listExperiments,
  concludeExperiment, pickWinner,
} from "@/lib/ab-testing";
import type { ABVariant } from "@/lib/model-analytics-types";

const CreateSchema = z.object({
  experimentId: z.string().min(1),
  name:         z.string().min(1),
  description:  z.string().default(""),
  allocation:   z.object({
    control:  z.number().min(0).max(100),
    variantA: z.number().min(0).max(100),
    variantB: z.number().min(0).max(100),
  }),
  agentOverrides: z.record(z.string(), z.any()).default({}),
});

export async function GET() {
  try {
    const experiments = await listExperiments();
    return NextResponse.json({ experiments });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { experimentId, name, description, allocation, agentOverrides } = parsed.data;

  try {
    const id = await createExperiment({
      experimentId, name, description,
      status:    "running",
      allocation: allocation as Record<ABVariant, number>,
      agentOverrides: agentOverrides as ABExperiment["agentOverrides"],
      startedAt: new Date().toISOString(),
    });
    return NextResponse.json({ experimentId: id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { experimentId, metrics, winner: manualWinner } = body as {
    experimentId: string;
    metrics?: Record<ABVariant, { requests: number; avgLatencyMs: number; avgQualityScore: number; userEngagement: number; errorRate: number }>;
    winner?: ABVariant;
  };

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const winner = manualWinner ?? (metrics ? pickWinner(metrics) : "control");

  try {
    await concludeExperiment(experimentId, winner);
    return NextResponse.json({ winner });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Fix missing type import
import type { ABExperiment } from "@/lib/model-analytics-types";
