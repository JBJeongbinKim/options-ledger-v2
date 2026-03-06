import { enqueue, QueueUnavailableError } from "./_lib/queue.js";
import { parseIncomingSmsToPendingImport } from "./_lib/smsImport.js";

function jsonReply(status, body, res) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readToken(req) {
  if (req?.headers instanceof Headers) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
    const apiKey = req.headers.get("x-api-key");
    return apiKey?.trim() || undefined;
  }

  const authHeader = typeof req?.headers?.authorization === "string" ? req.headers.authorization : undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  const apiKey = typeof req?.headers?.["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined;
  return apiKey?.trim() || undefined;
}

async function readBody(req) {
  if (typeof req?.json === "function") {
    const parsed = await req.json().catch(() => ({}));
    return parsed ?? {};
  }

  return req?.body ?? {};
}

export default async function handler(req, res) {
  try {
    const method = req?.method || "GET";
    if (method !== "POST") {
      return jsonReply(405, { error: "Method Not Allowed" }, res);
    }

    const expectedToken = process.env.SMS_WEBHOOK_TOKEN;
    const providedToken = readToken(req);
    if (!expectedToken || providedToken !== expectedToken) {
      return jsonReply(401, { error: "Unauthorized" }, res);
    }

    const body = await readBody(req);
    const smsText = (body.sms ?? body.message ?? "").toString().trim();
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
