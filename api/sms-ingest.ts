import { enqueue, QueueUnavailableError } from "./_lib/queue";
import { parseIncomingSmsToPendingImport } from "./_lib/smsImport";

interface SmsIngestBody {
  sms?: string;
  message?: string;
  sentAt?: string;
}

function isNodeResponse(res: unknown): res is { status: (code: number) => { json: (body: unknown) => unknown } } {
  return Boolean(
    res &&
      typeof (res as { status?: unknown }).status === "function" &&
      typeof (res as { json?: unknown }).json === "function",
  );
}

function jsonReply(status: number, body: unknown, res?: unknown): unknown {
  if (isNodeResponse(res)) {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readMethod(req: unknown): string {
  const method = (req as { method?: unknown })?.method;
  return typeof method === "string" ? method : "GET";
}

function readToken(req: unknown): string | undefined {
  const headers = (req as { headers?: unknown })?.headers;

  if (headers instanceof Headers) {
    const authHeader = headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7).trim();
    }

    const apiKey = headers.get("x-api-key");
    return apiKey?.trim() || undefined;
  }

  const record = headers as Record<string, unknown> | undefined;
  const authHeader = typeof record?.authorization === "string" ? record.authorization : undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const apiKey = typeof record?.["x-api-key"] === "string" ? (record["x-api-key"] as string) : undefined;
  return apiKey?.trim() || undefined;
}

async function readBody(req: unknown): Promise<SmsIngestBody> {
  const requestLike = req as { json?: () => Promise<unknown>; body?: unknown };
  if (typeof requestLike.json === "function") {
    const parsed = await requestLike.json().catch(() => ({}));
    return (parsed ?? {}) as SmsIngestBody;
  }

  return (requestLike.body ?? {}) as SmsIngestBody;
}

export default async function handler(req: unknown, res?: unknown): Promise<unknown> {
  try {
    const method = readMethod(req);
    if (method !== "POST") {
      return jsonReply(405, { error: "Method Not Allowed" }, res);
    }

    const expectedToken = process.env.SMS_WEBHOOK_TOKEN;
    const providedToken = readToken(req);
    if (!expectedToken || providedToken !== expectedToken) {
      return jsonReply(401, { error: "Unauthorized" }, res);
    }

    const body = await readBody(req);
    const smsText = (body.sms ?? body.message ?? "").trim();
    if (!smsText) {
      return jsonReply(400, { error: "sms is required" }, res);
    }

    const parsed = parseIncomingSmsToPendingImport(smsText, body.sentAt);
    if (!parsed) {
      return jsonReply(422, { error: "Unable to parse transaction message" }, res);
    }

    await enqueue(parsed);
    return jsonReply(200, { ok: true, id: parsed.id, mode: parsed.mode }, res);
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      return jsonReply(503, { error: error.message }, res);
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonReply(500, { error: message }, res);
  }
}
