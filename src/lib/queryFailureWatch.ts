// Marks a loader run whose database read failed (set by query() in db.ts).
// Kept profile data (profilePageData.ts) never keeps such a result. Its own
// module: db.ts is a 'use server' file, which may export async functions only.
import { AsyncLocalStorage } from 'node:async_hooks';

export const queryFailureWatch = new AsyncLocalStorage<{ failed: boolean }>();
