import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { encryptApiKey } from "@/lib/crypto";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, user_id, brand_name, cms_type, tone_guidelines, linking_threshold, primary_locale, token_limit, stripe_customer_id, created_at")
    .eq("id", id)
    .single();

  if (error || !project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { user_id: _uid, ...safeProject } = project;
  return NextResponse.json(safeProject);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: existing } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { tone_guidelines, linking_threshold, primary_locale, api_key, webhook_secret } = body;

  // Validate linking_threshold if provided
  if (linking_threshold !== undefined) {
    const val = Number(linking_threshold);
    if (isNaN(val) || val < 0 || val > 1) {
      return NextResponse.json({ error: "linking_threshold must be between 0 and 1" }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = {};

  if (tone_guidelines !== undefined) {
    if (typeof tone_guidelines === "string" && tone_guidelines.length > 2000) {
      return NextResponse.json({ error: "tone_guidelines must be 2000 characters or fewer" }, { status: 400 });
    }
    updates.tone_guidelines = tone_guidelines || null;
  }

  if (linking_threshold !== undefined) updates.linking_threshold = Number(linking_threshold);

  if (primary_locale !== undefined) {
    const localeRegex = /^[a-z]{2,3}(-[A-Za-z]{4})?(-[A-Z]{2})?$/;
    if (typeof primary_locale !== "string" || primary_locale.length > 20 || !localeRegex.test(primary_locale)) {
      return NextResponse.json(
        { error: "primary_locale must be a valid BCP 47 locale tag (e.g. en-US, fr-FR, zh-Hans-CN)" },
        { status: 400 }
      );
    }
    updates.primary_locale = primary_locale;
  }
  if (api_key) updates.api_key_enc = encryptApiKey(api_key);
  if (webhook_secret) updates.webhook_secret = encryptApiKey(webhook_secret);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("id, updated_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
