# Implementation: `engine/auth/` — Clerk + Sendblue

Auth/messaging tooling **reused by generated games** (not a gate on the engine's own chat UI).
Built from `research/clerk.md` (v6+) and `research/sendblue.md`.

---

## `engine/auth/clerk.ts`

Server-side Clerk (v6+) helpers. Imports `auth`, `currentUser` from `@clerk/nextjs/server`
(never from `@clerk/nextjs`); `auth()` is async and awaited. Middleware itself lives in
`proxy.ts` (`clerkMiddleware()`) — this module does not configure middleware.

**Deps:** `@clerk/nextjs/server`, `zod`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `clerkCredentialsConfigured` | `() => boolean` | True iff `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` set (dev runs keyless). |
| `SessionStateSchema` / `SessionState` | Zod schema / type | `{ isAuthenticated, userId, sessionId, orgId, orgRole }` (nullable fields). |
| `getSessionState` | `() => Promise<SessionState>` | Normalized session; never throws on anon. |
| `requireAuthInRouteHandler` | `() => Promise<{ ok: true; userId } \| { ok: false; response: Response }>` | 401 guard for Route Handlers. |
| `UserProfileSchema` / `UserProfile` | Zod schema / type | `{ userId, fullName, primaryEmail, imageUrl }`. |
| `getCurrentUserProfile` | `() => Promise<UserProfile \| null>` | Trimmed `currentUser()` profile; null when anon. |
| `extractBearerToken` | `(header: string \| null \| undefined) => string \| null` | Pull session JWT from `Authorization: Bearer …` for non-middleware (plain Node) routes. |

### Usage

```ts
// Route handler in a generated game
import { requireAuthInRouteHandler } from '@/engine/auth/clerk';
export async function GET() {
  const gate = await requireAuthInRouteHandler();
  if (!gate.ok) return gate.response; // 401
  return Response.json({ userId: gate.userId });
}

// Server component
import { getCurrentUserProfile } from '@/engine/auth/clerk';
const profile = await getCurrentUserProfile(); // null if signed out
```

Client side (not in this module): `useAuth().getToken()` mints the JWT; pass it as
`Authorization: Bearer <token>`; the server pulls it with `extractBearerToken`.

---

## `engine/auth/sendblue.ts`

Sendblue iMessage/SMS REST client — the multiplayer + login messaging channel. SERVER-ONLY;
credentials read from env (`SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`,
`SENDBLUE_FROM_NUMBER`). `fetch` is dependency-injected for offline testing. All numbers E.164.

**Deps:** `zod` (+ global `fetch`, injectable). Endpoint: `POST https://api.sendblue.co/api/send-message`.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `createSendblueClient` | `(opts?: { credentials?, fetchImpl?, endpoint? }) => SendblueClient` | Factory; resolves+validates creds (throws if absent). |
| `SendblueClient` | `{ sendMessage(input): Promise<SendMessageResult> }` | Client interface. |
| `resolveSendblueCredentials` | `(overrides?) => SendblueCredentials \| null` | Env + override resolution; null if keys missing. |
| `isE164` | `(value: unknown) => value is string` | E.164 validation (`/^\+[1-9]\d{1,14}$/`). |
| `redactPhone` | `(value) => string` | `+1•••••••77` style masking for logs. |
| `sendLoginLink` | `(client, to, link, opts?) => Promise<SendMessageResult>` | Login magic-link/code message. |
| `sendMultiplayerInvite` | `(client, to, inviteUrl, opts?) => Promise<SendMessageResult>` | Invite w/ `confetti` iMessage effect. |
| `SendStyleSchema`, `MessageStatusSchema`, `MessageResponseSchema` | Zod schemas | Effects, `QUEUED\|SENT\|DELIVERED\|ERROR`, response (passthrough). |
| `FetchLike`, `SendMessageInput`, `SendMessageResult`, `SendblueCredentials`, `MessageResponse`, … | types | Typed boundaries. |

`SendMessageInput`: `{ number, content?, fromNumber?, mediaUrl?, sendStyle?, statusCallback?, seatId? }`
(either `content` or `mediaUrl` required). `SendMessageResult` is a discriminated union on `ok`.

### Request shape

Headers: `sb-api-key-id`, `sb-api-secret-key`, `Content-Type: application/json` (keys never
logged). Body maps camelCase input → snake_case API fields (`from_number`, `media_url`,
`send_style`, `status_callback`, `seat_id`).

### Error handling (all return `{ ok: false, error }`, none throw post-construction)

Non-E.164 recipient/sender, missing content+media, HTTP non-2xx (`httpStatus` surfaced),
non-JSON body, schema mismatch, network throw, and API `status: ERROR` (`error_message` surfaced).

### Usage

```ts
import { createSendblueClient, sendMultiplayerInvite } from '@/engine/auth/sendblue';
const sb = createSendblueClient(); // env creds + global fetch
const res = await sendMultiplayerInvite(sb, '+19998887777', 'https://game.app/join/42', {
  inviterName: 'Ada', gameName: 'Snake',
  statusCallback: 'https://game.app/api/sendblue-status',
});
if (!res.ok) console.error(res.error);
```

---

## Tests

`engine/auth/sendblue.test.ts` — 16 offline cases via `npx tsx engine/auth/sendblue.test.ts`
(DI fetch stub): request shape + auth headers, header/phone redaction in logs, E.164
validation, content/media/from-number guards, HTTP error, API ERROR, non-JSON, schema
mismatch, network throw, and both convenience wrappers. Clerk helpers depend on Next request
context (`auth()`), so they are validated via `tsc` typecheck rather than a runtime harness.

## Verification

`npm run typecheck` clean · ESLint (temp typescript-eslint flat config, `no-undef` /
`@typescript-eslint/no-unused-vars`) clean · tests green · `npm run build` passes.
