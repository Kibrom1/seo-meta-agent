import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { encryptApiKey } from "@/lib/crypto";
import { createStripeCustomer } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const { brand_name, cms_type, api_key, webhook_secret, tone_guidelines } = await request.json();

  if (!brand_name || !cms_type || !api_key || !webhook_secret) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Encrypt sensitive fields before storage
  const api_key_enc = encryptApiKey(api_key);
  const webhook_secret_enc = encryptApiKey(webhook_secret);

  // Create Stripe customer for billing metering
  let stripe_customer_id: string | null = null;
  let stripeWarning: string | undefined;
  try {
    stripe_customer_id = await createStripeCustomer(user.email ?? userId);
  } catch (err) {
    console.error("[projects] Failed to create Stripe customer:", err);
    stripeWarning = "Stripe customer could not be created — billing metering will be unavailable until resolved.";
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      brand_name,
      cms_type,
      api_key_enc,
      webhook_secret: webhook_secret_enc,
      tone_guidelines: tone_guidelines || null,
      stripe_customer_id,
    })
    .select("id")
    .single();

  if (error || !project) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json(
    { id: project.id, ...(stripeWarning ? { warning: stripeWarning } : {}) },
    { status: 201 }
  );
}
