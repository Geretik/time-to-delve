/** Stand-ins for the Next.js request APIs the server code uses (wired up in setup.ts). */

export const cookieJar = new Map<string, string>();

export const nextHeaders = {
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers({ host: "localhost:3000" }),
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

export const nextCache = { refresh: () => {}, revalidatePath: () => {}, revalidateTag: () => {} };
