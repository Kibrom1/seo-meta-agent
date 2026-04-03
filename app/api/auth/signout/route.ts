import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
