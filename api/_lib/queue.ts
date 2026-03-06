import { kv } from "@vercel/kv";
import type { PendingServerImport } from "./smsImport";

const QUEUE_KEY = "options-ledger-v2.pending-import-queue";
const MAX_QUEUE = 200;

export async function readQueue(): Promise<PendingServerImport[]> {
  const queue = await kv.get<PendingServerImport[]>(QUEUE_KEY);
  return Array.isArray(queue) ? queue : [];
}

export async function writeQueue(queue: PendingServerImport[]): Promise<void> {
  const trimmed = queue.slice(-MAX_QUEUE);
  await kv.set(QUEUE_KEY, trimmed);
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
