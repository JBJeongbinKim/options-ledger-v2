import { getKvClient, toKvUnavailableError } from "./kvStore.js";

const APP_STATE_KEY = "options-ledger-v2.app-state";

export async function readAppState() {
  try {
    const kv = await getKvClient();
    const snapshot = await kv.get(APP_STATE_KEY);
    return snapshot && typeof snapshot === "object" ? snapshot : null;
  } catch (error) {
    throw toKvUnavailableError(error);
  }
}

export async function writeAppState(snapshot) {
  try {
    const kv = await getKvClient();
    await kv.set(APP_STATE_KEY, snapshot);
  } catch (error) {
    throw toKvUnavailableError(error);
  }
}
