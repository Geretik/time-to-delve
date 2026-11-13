/** Stand-ins for the Next.js request APIs the server code uses (wired up in setup.ts). */

export const cookieJar = new Map<string, string>();

/** Extra headers of the pretend request, e.g. `requestHeaders["x-forwarded-for"] = "1.2.3.4"`. */
export const requestHeaders: Record<string, string> = {};

export const nextHeaders = {
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers({ host: "localhost:3000", ...requestHeaders }),
};

/** What `redirect()` throws, so a test can tell where an action sent the user. */
export class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

export const nextNavigation = {
  redirect: (to: string): never => {
    throw new Redirect(to);
  },
};

/**
 * `after()` only queues its callback, as the real one does until the response is out;
 * `afterDone()` then runs what is queued and waits for it. A test that forgets to call it
 * doesn't leak the work into the next one – setup.ts runs it after every test.
 */
const afterWork: (() => unknown)[] = [];
export const nextServer = { after: (fn: () => unknown) => void afterWork.push(fn) };
export async function afterDone() {
  while (afterWork.length) await afterWork.shift()!();
}

export const nextCache = { refresh: () => {}, revalidatePath: () => {}, revalidateTag: () => {} };
