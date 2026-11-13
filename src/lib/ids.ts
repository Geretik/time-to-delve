import { z } from "zod";

// Server Action arguments come straight from the client, whatever their TypeScript type
// says. Check ids with these before they reach a query: a malformed uuid would only make
// Postgres throw.

/** Row id of users, cards and classes. */
export const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

/** Row id of sessions and tokens: the SHA-256 of the secret, in hex. */
export const isTokenId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{64}$/.test(id);
