# Clerk.js API Reference (verified against clerk.com/docs)

> Researched 2026-06-06 against https://clerk.com/docs. Clerk's API has churned a lot — middleware is `clerkMiddleware()` (NOT the old `authMiddleware()`), and the 2026 docs now favor `<Show>` over `<SignedIn>/<SignedOut>` and place middleware in `proxy.ts`. Verify against current docs if anything looks off.

## Next.js setup

```bash
npm install @clerk/nextjs
```

1. **Middleware** — `proxy.ts` (or `src/proxy.ts`; previously `middleware.ts`):

```ts
import { clerkMiddleware } from '@clerk/nextjs/server';
export default clerkMiddleware();
export const config = { matcher: [/* protected route matchers */] };
```

`clerkMiddleware()` reads the session JWT from cookies/headers and attaches the Auth object to the request. Must run before other middleware. Do NOT use the deprecated `authMiddleware()`.

2. **Provider** — `app/layout.tsx`: wrap content with `<ClerkProvider>` inside `<body>`.

3. **UI components** (from `@clerk/nextjs`): `<SignInButton>`, `<SignUpButton>`, `<UserButton>`, `<SignIn>`, `<SignUp>`, and conditional rendering with `<Show when="signed-in">` (docs now mark `<SignedIn>/<SignedOut>` as the legacy pattern).

4. **Keyless mode**: works without env vars in dev (temp credentials); production needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.

## Server-side: `auth()` and `currentUser()` (App Router, server-only)

```ts
import { auth, currentUser } from '@clerk/nextjs/server';

export default async function Page() {
  const { isAuthenticated, userId, sessionId, sessionClaims, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();
  const user = await currentUser();   // full User object (server fetch)
  return <h1>Hello, {userId}</h1>;
}
```

- `auth()` is **async — must be awaited** (v6+). Works in Server Components, Route Handlers, Server Actions only; requires clerkMiddleware.
- Returns: `userId`, `sessionId`, `sessionClaims`, `isAuthenticated`, `getToken()`, `has()`, `protect()`, `redirectToSignIn()`.

### `auth.protect()`

```ts
const { userId } = await auth.protect();                     // redirect to sign-in if unauthenticated
await auth.protect({ role: 'org:admin' });                   // 404 if authenticated but unauthorized
await auth.protect((has) => has({ permission: 'org:invoices:create' }));
```

| State | Outcome |
|---|---|
| Authenticated + authorized | returns Auth object |
| Authenticated, unauthorized | 404 |
| Unauthenticated (page) | redirect to sign-in |
| Unauthenticated (API/machine) | 401 |

## Client-side hooks (from `@clerk/nextjs` / `@clerk/clerk-react`)

```tsx
import { useAuth, useUser } from '@clerk/nextjs';

const { isLoaded, isSignedIn, userId, sessionId, orgId, orgRole, getToken, signOut, has } = useAuth();
const { isLoaded, isSignedIn, user } = useUser();   // user.id, user.fullName, user.primaryEmailAddress, user.update(...)
```

`getToken()` returns the session JWT for calling your own APIs:

```ts
const token = await getToken();           // or getToken({ template: 'my-jwt-template' })
fetch('/api/thing', { headers: { Authorization: `Bearer ${token}` } });
```

Always gate on `isLoaded` before trusting `isSignedIn`.

## Protecting a Route Handler

```ts
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated) return new Response('Unauthorized', { status: 401 });
  // ...
}
```

## Express / plain Node

`@clerk/express` provides `clerkMiddleware()` and `requireAuth()`; auth state via `getAuth(req)`. Backend SDK (`@clerk/backend`) verifies Bearer JWTs for non-Next servers.

## Hallucination traps

- ❌ `authMiddleware()` — replaced by `clerkMiddleware()` from `@clerk/nextjs/server`.
- ❌ Sync `auth()` — it is async in current versions; `await auth()`.
- ❌ `withAuth` HOC / Pages Router patterns in new code — App Router + middleware is current.
- ❌ Importing server helpers from `@clerk/nextjs` — server helpers come from `@clerk/nextjs/server`.
- `useAuth().getToken` not `useUser().getToken`.

## Sources
- https://clerk.com/docs/quickstarts/nextjs
- https://clerk.com/docs/reference/nextjs/app-router/auth
- https://clerk.com/docs/nextjs/reference/hooks/use-auth
- https://clerk.com/docs/reference/express/clerk-middleware
