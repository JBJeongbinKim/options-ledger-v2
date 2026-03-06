export class KvUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "KvUnavailableError";
  }
}

function hasKvConfig() {
  const hasVercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return hasVercelKv || hasUpstash;
}

function ensureKvConfigured() {
  if (!hasKvConfig()) {
    throw new KvUnavailableError(
      "KV is not configured. Add an Upstash Redis/KV integration in Vercel and redeploy.",
    );
  }
}

function normalizeKvError(error) {
  if (error instanceof KvUnavailableError) return error;
  const message = error instanceof Error ? error.message : "Unknown KV error";
  return new KvUnavailableError(`KV request failed: ${message}`);
}

export async function getKvClient() {
  ensureKvConfigured();
  try {
    const mod = await import("@vercel/kv");
    return mod.kv;
  } catch (error) {
    throw normalizeKvError(error);
  }
}

export function toKvUnavailableError(error) {
  return normalizeKvError(error);
}
