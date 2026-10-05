import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
    reqId: string;
    userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
    return storage.getStore();
}

/** Attaches the authenticated user to the current request so every later log line includes `userId`. */
export function setContextUserId(userId: string): void {
    const context = storage.getStore();
    if (context) context.userId = userId;
}
