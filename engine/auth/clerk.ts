/**
 * Clerk methods for authentication and user management that can be reused across games
 *
 * Reusable Clerk (v6+, @clerk/nextjs) auth helpers. These are TOOLING shared by the
 * *generated* games — there is intentionally NO Clerk gate on the engine's own chat UI.
 * Middleware itself lives in proxy.ts (clerkMiddleware()); this module
 * only wraps the server-side `auth()` / `currentUser()` surface plus a plain-Node Bearer
 * token extractor for generated games' API routes that run outside Next middleware.
 *
 * Verified against research/clerk.md:
 *  - `auth()` is async and MUST be awaited (v6+).
 *  - Server helpers come from `@clerk/nextjs/server`, never `@clerk/nextjs`.
 *  - `authMiddleware()` is dead — `clerkMiddleware()` is current (handled in proxy.ts).
 *
 * Conventions match engine/ai/providers.ts: named exports, factory functions, structured
 * logging with REDACTED secrets, defensive null guards, Zod-validated boundaries.
 */
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';

const AUTH_LOG_PREFIX = '[engine/auth/clerk]';

/** Redact a secret/token for logging — keep only a coarse length hint, never the value. */
function redact(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.length === 0) return '<unset>';
  return `<redacted:len=${value.length}>`;
}

/** Whether production Clerk credentials are present (dev runs keyless). */
export function clerkCredentialsConfigured(): boolean {
  const pub = process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
  const secret = process.env['CLERK_SECRET_KEY'];
  const configured = Boolean(pub) && Boolean(secret);
  console.log(
    `${AUTH_LOG_PREFIX} credentialsConfigured=${configured} publishableKeySet=${Boolean(pub)} secretKey=${redact(secret)}`,
  );
  return configured;
}

/**
 * Normalized, Zod-validated view of the current session for reuse across generated games.
 * `isAuthenticated` is the canonical gate; `userId` is present iff authenticated.
 */
export const SessionStateSchema = z.object({
  isAuthenticated: z.boolean(),
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  orgId: z.string().nullable(),
  orgRole: z.string().nullable(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * Read + normalize the current Clerk session (Server Component / Route Handler / Action only).
 * Requires clerkMiddleware (proxy.ts) to be active. Never throws on an anonymous visitor —
 * returns an unauthenticated SessionState instead.
 */
export async function getSessionState(): Promise<SessionState> {
  const a = await auth();
  const state: SessionState = SessionStateSchema.parse({
    isAuthenticated: Boolean(a.isAuthenticated),
    userId: a.userId ?? null,
    sessionId: a.sessionId ?? null,
    orgId: a.orgId ?? null,
    orgRole: a.orgRole ?? null,
  });
  console.log(
    `${AUTH_LOG_PREFIX} getSessionState authenticated=${state.isAuthenticated} userId=${state.userId ? redact(state.userId) : '<none>'} orgId=${state.orgId ?? '<none>'}`,
  );
  return state;
}

/**
 * Guard a Route Handler: returns `{ userId }` when authenticated, otherwise a 401 `Response`
 * the caller should return directly. Keeps generated-game APIs from leaking on the anon path.
 */
export async function requireAuthInRouteHandler(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    console.warn(`${AUTH_LOG_PREFIX} requireAuthInRouteHandler denied (unauthenticated)`);
    return {
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    };
  }
  console.log(`${AUTH_LOG_PREFIX} requireAuthInRouteHandler allow userId=${redact(userId)}`);
  return { ok: true, userId };
}

/** A trimmed, Zod-validated public profile derived from Clerk's full User object. */
export const UserProfileSchema = z.object({
  userId: z.string(),
  fullName: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Fetch + normalize the signed-in user's profile (server-side). Returns null when anonymous.
 * Guards every nested field — Clerk's User shape is deep and partially optional.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = await currentUser();
  if (!user) {
    console.log(`${AUTH_LOG_PREFIX} getCurrentUserProfile anonymous`);
    return null;
  }
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    null;
  const profile = UserProfileSchema.parse({
    userId: user.id,
    fullName: user.fullName ?? null,
    primaryEmail,
    imageUrl: user.imageUrl ?? null,
  });
  console.log(
    `${AUTH_LOG_PREFIX} getCurrentUserProfile userId=${redact(profile.userId)} hasEmail=${Boolean(profile.primaryEmail)}`,
  );
  return profile;
}

/**
 * Extract a Bearer token from an Authorization header value. Pure + DI-friendly so generated
 * games running outside Next middleware (plain Node / edge functions) can pull the session JWT
 * minted by `useAuth().getToken()` on the client.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (typeof authorizationHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim();
  if (!token) {
    console.warn(`${AUTH_LOG_PREFIX} extractBearerToken: no bearer token in Authorization header`);
    return null;
  }
  console.log(`${AUTH_LOG_PREFIX} extractBearerToken token=${redact(token)}`);
  return token;
}
