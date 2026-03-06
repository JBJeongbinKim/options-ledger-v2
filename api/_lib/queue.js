import { KvUnavailableError, getKvClient, toKvUnavailableError } from "./kvStore.js";

export class QueueUnavailableError extends KvUnavailableError {
  constructor(message) {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

const QUEUE_KEY = "options-ledger-v2.pending-import-queue";
const MAX_QUEUE = 200;

function normalizeQueueError(error) {
  if (error instanceof QueueUnavailableError) return error;
  return new QueueUnavailableError(toKvUnavailableError(error).message);
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
