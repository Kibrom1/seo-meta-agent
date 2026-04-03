import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createServerClient, createServiceClient } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load project (need webhook_secret + primary_locale)
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, webhook_secret, primary_locale")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const locale = project.primary_locale ?? "en-US";
  const syntheticEntryId = `test-ping-${Date.now()}`;

  // Build a minimal valid webhook payload
  const payload = {
    sys: { type: "Entry", id: syntheticEntryId },
    fields: { title: { [locale]: "Webhook Connectivity Test" } },
  };
  const bodyStr = JSON.stringify(payload);

  // Sign with the project's webhook secret
  let plainSecret: string;
  try {
    plainSecret = decryptApiKey(project.webhook_secret);
  } catch {
    return NextResponse.json(
      { ok: false, message: "Could not decrypt webhook secret — project may be misconfigured" },
      { status: 200 }
    );
  }
  const hmac = "sha256=" + createHmac("sha256", plainSecret).update(bodyStr).digest("hex");

  // Fire at our own webhook endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhook/cms-event?projectId=${id}`;

  let responseStatus = 0;
  let taskIds: string[] = [];

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": hmac,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = res.status;
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      taskIds = json.taskIds ?? [];
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: `Could not reach webhook endpoint: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 200 });
  }

  // Clean up any agent_tasks rows created by the test
  if (taskIds.length > 0) {
    const svc = createServiceClient();
    await svc.from("agent_tasks").delete().in("id", taskIds);
  }
  // Also clean up by entry_id scoped to this project, in case taskIds weren't returned
  const svc = createServiceClient();
  await svc.from("agent_tasks").delete().eq("entry_id", syntheticEntryId).eq("project_id", id);

  if (responseStatus === 401) {
    return NextResponse.json({
      ok: false,
      status: responseStatus,
      message: "Webhook endpoint rejected the HMAC signature — check that your webhook secret matches what is configured in your CMS.",
    });
  }

  if (responseStatus === 202 || responseStatus === 200) {
    return NextResponse.json({
      ok: true,
      status: responseStatus,
      message: "Webhook is reachable and HMAC signature validated successfully.",
    });
  }

  return NextResponse.json({
    ok: false,
    status: responseStatus,
    message: `Webhook returned an unexpected status: ${responseStatus}`,
  });
}
