/**
 * POST /api/push/subscribe
 * Save a new Web Push subscription.
 * Body: { subscription: { endpoint, keys }, topics?: string[] }
 *
 * DELETE /api/push/subscribe
 * Remove a subscription.
 * Body: { endpoint: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveSubscription, removeSubscription } from "@/lib/web-push";

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth:   z.string(),
    }),
  }),
  topics: z.array(z.string()).optional().default(["all"]),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const record = await saveSubscription(
    parsed.data.subscription,
    parsed.data.topics
  );
  return NextResponse.json({ subscriptionId: record.subscriptionId });
}

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await removeSubscription(parsed.data.endpoint);
  return NextResponse.json({ success: true });
}
