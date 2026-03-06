export class QueueUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

const QUEUE_KEY = "options-ledger-v2.pending-import-queue";
const MAX_QUEUE = 200;

function hasKvConfig() {
  const hasVercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return hasVercelKv || hasUpstash;
}

function ensureKvConfigured() {
  if (!hasKvConfig()) {
    throw new QueueUnavailableError(
      "KV is not configured. Add an Upstash Redis/KV integration in Vercel and redeploy.",
    );
  }
}

function normalizeQueueError(error) {
  if (error instanceof QueueUnavailableError) return error;
  const message = error instanceof Error ? error.message : "Unknown queue error";
  return new QueueUnavailableError(`KV request failed: ${message}`);
}

async function getKvClient() {
  ensureKvConfigured();
  try {
    const mod = await import("@vercel/kv");
    return mod.kv;
  } catch (error) {
    throw normalizeQueueError(error);
  }
}

export async function readQueue() {
  try {
    const kv = await getKvClient();
    const queue = await kv.get(QUEUE_KEY);
    return Array.isArray(queue) ? queue : [];
  } catch (error) {
    throw normalizeQueueError(error);
  }
}

export async function writeQueue(queue) {
  const trimmed = queue.slice(-MAX_QUEUE);
  try {
    const kv = await getKvClient();
    await kv.set(QUEUE_KEY, trimmed);
  } catch (error) {
    throw normalizeQueueError(error);
  }
}

export async function enqueue(item) {
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
}

export async function peekNext() {
  const queue = await readQueue();
  return queue[0] ?? null;
}

export async function removeById(id) {
  const queue = await readQueue();
  const nextQueue = queue.filter((item) => item.id !== id);
  if (nextQueue.length === queue.length) return false;
  await writeQueue(nextQueue);
  return true;
}
