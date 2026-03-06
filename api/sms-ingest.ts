import { enqueue } from "./_lib/queue";
import { parseIncomingSmsToPendingImport } from "./_lib/smsImport";

interface SmsIngestBody {
  sms?: string;
  message?: string;
  sentAt?: string;
}

function readToken(req: any): string | undefined {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const apiKey = req.headers?.["x-api-key"];
  return typeof apiKey === "string" ? apiKey.trim() : undefined;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const expectedToken = process.env.SMS_WEBHOOK_TOKEN;
  const providedToken = readToken(req);
  if (!expectedToken || providedToken !== expectedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as SmsIngestBody;
  const smsText = (body.sms ?? body.message ?? "").trim();
  if (!smsText) {
    res.status(400).json({ error: "sms is required" });
    return;
  }

  const parsed = parseIncomingSmsToPendingImport(smsText, body.sentAt);
  if (!parsed) {
    res.status(422).json({ error: "Unable to parse transaction message" });
    return;
  }

  await enqueue(parsed);
  res.status(200).json({ ok: true, id: parsed.id, mode: parsed.mode });
}
