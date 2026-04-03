import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import type { UsageForecast } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, token_limit")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Monthly total via existing RPC
  const { data: usageData } = await supabase.rpc("get_monthly_token_usage", { p_project_id: id });
  const tokens_used = Number(usageData?.[0]?.total_tokens ?? 0);

  // Daily breakdown via new RPC
  const { data: dailyData } = await supabase.rpc("get_daily_token_usage", { p_project_id: id });
  const daily_breakdown = (dailyData ?? []) as Array<{ day: string; total_tokens: number }>;

  // Projection
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const days_elapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86_400_000));
  const days_remaining_in_month = Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000));
  const daily_avg = tokens_used / days_elapsed;
  const projected_month_end = Math.round(tokens_used + daily_avg * days_remaining_in_month);
  const token_limit = project.token_limit;

  const forecast: UsageForecast = {
    tokens_used,
    token_limit,
    percent_used: token_limit > 0 ? Math.round((tokens_used / token_limit) * 100) : 0,
    projected_month_end,
    days_remaining_in_month,
    will_exceed: projected_month_end > token_limit,
    daily_breakdown,
  };

  return NextResponse.json(forecast);
}
