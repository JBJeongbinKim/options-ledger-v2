import { kv } from "@vercel/kv";
import type { PendingServerImport } from "./smsImport";

const QUEUE_KEY = "options-ledger-v2.pending-import-queue";
const MAX_QUEUE = 200;

export class QueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

function hasKvConfig(): boolean {
  const hasVercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return hasVercelKv || hasUpstash;
}

function ensureKvConfigured(): void {
  if (!hasKvConfig()) {
    throw new QueueUnavailableError(
      "KV is not configured. Add an Upstash Redis/KV integration in Vercel and redeploy.",
    );
  }
}

function normalizeQueueError(error: unknown): QueueUnavailableError {
  if (error instanceof QueueUnavailableError) return error;
  const message = error instanceof Error ? error.message : "Unknown queue error";
  return new QueueUnavailableError(`KV request failed: ${message}`);
}

export async function readQueue(): Promise<PendingServerImport[]> {
  ensureKvConfigured();
  try {
    const queue = await kv.get<PendingServerImport[]>(QUEUE_KEY);
    return Array.isArray(queue) ? queue : [];
  } catch (error) {
    throw normalizeQueueError(error);
  }
}

export async function writeQueue(queue: PendingServerImport[]): Promise<void> {
  ensureKvConfigured();
  const trimmed = queue.slice(-MAX_QUEUE);
  try {
    await kv.set(QUEUE_KEY, trimmed);
  } catch (error) {
    throw normalizeQueueError(error);
  }
}

export async function enqueue(item: PendingServerImport): Promise<void> {
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
}

export async function peekNext(): Promise<PendingServerImport | null> {
  const queue = await readQueue();
  return queue[0] ?? null;
}

export async function removeById(id: string): Promise<boolean> {
  const queue = await readQueue();
  const nextQueue = queue.filter((item) => item.id !== id);
  if (nextQueue.length === queue.length) return false;
  await writeQueue(nextQueue);
  return true;
}
