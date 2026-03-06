import { enqueue, QueueUnavailableError } from "./_lib/queue";
import { parseIncomingSmsToPendingImport } from "./_lib/smsImport";

interface SmsIngestBody {
  sms?: string;
  message?: string;
  sentAt?: string;
}

function readToken(headers: Headers): string | undefined {
  const authHeader = headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const apiKey = headers.get("x-api-key");
  return apiKey?.trim() || undefined;
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "Method Not Allowed" }, { status: 405 });
    }

    const expectedToken = process.env.SMS_WEBHOOK_TOKEN;
    const providedToken = readToken(request.headers);
    if (!expectedToken || providedToken !== expectedToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SmsIngestBody;
    const smsText = (body.sms ?? body.message ?? "").trim();
    if (!smsText) {
      return Response.json({ error: "sms is required" }, { status: 400 });
    }

    const parsed = parseIncomingSmsToPendingImport(smsText, body.sentAt);
    if (!parsed) {
      return Response.json({ error: "Unable to parse transaction message" }, { status: 422 });
    }

    await enqueue(parsed);
    return Response.json({ ok: true, id: parsed.id, mode: parsed.mode }, { status: 200 });
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
