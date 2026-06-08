/**
 * Sendblue messaging client — iMessage (with automatic SMS/MMS fallback) REST channel.
 *
 * Used by the engine + generated games as the multiplayer / login messaging channel:
 * magic-link login codes, multiplayer invites, and generation-complete notifications
 * (see research/architecture.md). SERVER-ONLY — credentials must never reach
 * the client; call from Vercel functions only.
 *
 * Verified against research/sendblue.md:
 *  - POST https://api.sendblue.co/api/send-message
 *  - Headers: sb-api-key-id / sb-api-secret-key / Content-Type (from env, redacted in logs)
 *  - Numbers are E.164 throughout (+countrycode...)
 *  - Response status: QUEUED | SENT | DELIVERED | ERROR (+ message_handle, error_code, ...)
 *
 * Conventions match engine/ai/providers.ts: named exports, factory functions, structured
 * logging with REDACTED secrets/phone numbers, defensive null guards, Zod-validated responses.
 * `fetch` is dependency-injected so the client is testable offline.
 */
import { z } from 'zod';

const SENDBLUE_LOG_PREFIX = '[engine/auth/sendblue]';
const SEND_MESSAGE_URL = 'https://api.sendblue.co/api/send-message';

/** E.164: leading +, country code (1-9), up to 14 more digits. */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** A minimal fetch signature so tests can inject a stub without DOM lib coupling. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

/** iMessage delivery effects supported by Sendblue. */
export const SendStyleSchema = z.enum([
  'celebration',
  'shooting_star',
  'fireworks',
  'lasers',
  'love',
  'confetti',
  'balloons',
  'spotlight',
  'echo',
  'invisible',
  'gentle',
  'loud',
  'slam',
]);
export type SendStyle = z.infer<typeof SendStyleSchema>;

/** Lifecycle status echoed by the API and arriving on status_callback webhooks. */
export const MessageStatusSchema = z.enum(['QUEUED', 'SENT', 'DELIVERED', 'ERROR']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

/**
 * Response from /api/send-message. Sendblue echoes the request plus delivery metadata;
 * unknown extra fields are tolerated (passthrough) so we don't break on API additions.
 */
export const MessageResponseSchema = z
  .object({
    status: MessageStatusSchema,
    number: z.string().optional(),
    from_number: z.string().optional(),
    content: z.string().optional(),
    media_url: z.string().optional(),
    message_handle: z.string().optional(),
    date_created: z.string().optional(),
    date_updated: z.string().optional(),
    error_code: z.union([z.string(), z.number()]).nullable().optional(),
    error_message: z.string().nullable().optional(),
    sender_email: z.string().optional(),
    account_email: z.string().optional(),
  })
  .passthrough();
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export interface SendblueCredentials {
  apiKeyId: string;
  apiSecretKey: string;
  /** Default registered Sendblue sender number (E.164). Falls back to SENDBLUE_FROM_NUMBER. */
  fromNumber?: string;
}

export interface SendMessageInput {
  /** Recipient, E.164. */
  number: string;
  /** Message text. Either `content` or `mediaUrl` is required. */
  content?: string;
  /** Sender number (E.164). Overrides the client default. */
  fromNumber?: string;
  /** Image/video URL for MMS. */
  mediaUrl?: string;
  /** iMessage effect. */
  sendStyle?: SendStyle;
  /** Webhook URL Sendblue posts delivery-status updates to. */
  statusCallback?: string;
  /** Sending seat (UUID or Firebase Auth subject). */
  seatId?: string;
}

export type SendMessageResult =
  | { ok: true; status: MessageStatus; response: MessageResponse }
  | { ok: false; error: string; httpStatus?: number; response?: MessageResponse };

/** Redact a secret for logging — never emit the value, only a length hint. */
function redactSecret(value: string | undefined | null): string {
  if (typeof value !== 'string' || value.length === 0) return '<unset>';
  return `<redacted:len=${value.length}>`;
}

/**
 * Redact a phone number for logging: keep country-code hint + last 2 digits, mask the middle.
 * e.g. +19998887777 → +1•••••••77
 */
export function redactPhone(value: string | undefined | null): string {
  if (typeof value !== 'string' || value.length === 0) return '<unset>';
  const cc = value.startsWith('+') ? value.slice(0, 2) : '';
  const tail = value.slice(-2);
  return `${cc}•••••••${tail}`;
}

/** Validate an E.164 phone number; logs a redacted failure and returns false on mismatch. */
export function isE164(value: unknown): value is string {
  const valid = typeof value === 'string' && E164_REGEX.test(value);
  if (!valid) {
    console.warn(`${SENDBLUE_LOG_PREFIX} isE164 rejected number=${redactPhone(typeof value === 'string' ? value : '')}`);
  }
  return valid;
}

/** Resolve credentials from explicit overrides, falling back to env. Never logs the values. */
export function resolveSendblueCredentials(
  overrides: Partial<SendblueCredentials> = {},
): SendblueCredentials | null {
  const apiKeyId = overrides.apiKeyId ?? process.env['SENDBLUE_API_KEY_ID'] ?? '';
  const apiSecretKey = overrides.apiSecretKey ?? process.env['SENDBLUE_API_SECRET_KEY'] ?? '';
  const fromNumber = overrides.fromNumber ?? process.env['SENDBLUE_FROM_NUMBER'];
  if (!apiKeyId || !apiSecretKey) {
    console.error(
      `${SENDBLUE_LOG_PREFIX} resolveSendblueCredentials missing keys apiKeyId=${redactSecret(apiKeyId)} apiSecretKey=${redactSecret(apiSecretKey)}`,
    );
    return null;
  }
  const creds: SendblueCredentials = { apiKeyId, apiSecretKey };
  if (fromNumber !== undefined) creds.fromNumber = fromNumber;
  return creds;
}

export interface SendblueClient {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}

export interface CreateSendblueClientOptions {
  credentials?: Partial<SendblueCredentials>;
  /** Injected fetch for testability; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Override the endpoint (tests). Defaults to the production send-message URL. */
  endpoint?: string;
}

/**
 * Factory for a Sendblue client. Resolves + validates credentials up front (throws if absent —
 * a misconfigured channel should fail loud at startup, not silently drop login messages).
 */
export function createSendblueClient(options: CreateSendblueClientOptions = {}): SendblueClient {
  const resolved = resolveSendblueCredentials(options.credentials ?? {});
  if (!resolved) {
    throw new Error(
      `${SENDBLUE_LOG_PREFIX} createSendblueClient: missing SENDBLUE_API_KEY_ID / SENDBLUE_API_SECRET_KEY`,
    );
  }
  const creds: SendblueCredentials = resolved;
  const fetchImpl: FetchLike =
    options.fetchImpl ??
    (globalThis.fetch as unknown as FetchLike | undefined) ??
    (() => {
      throw new Error(`${SENDBLUE_LOG_PREFIX} no fetch implementation available`);
    });
  const endpoint = options.endpoint ?? SEND_MESSAGE_URL;

  console.log(
    `${SENDBLUE_LOG_PREFIX} client init apiKeyId=${redactSecret(creds.apiKeyId)} fromNumber=${redactPhone(creds.fromNumber)} endpoint=${endpoint}`,
  );

  async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    // ── Validate inputs (defensive; we own the login/multiplayer channel) ──
    if (!input || typeof input !== 'object') {
      return { ok: false, error: 'sendMessage: input object required' };
    }
    if (!isE164(input.number)) {
      return { ok: false, error: 'sendMessage: recipient number must be E.164' };
    }
    const fromNumber = input.fromNumber ?? creds.fromNumber;
    if (!fromNumber || !isE164(fromNumber)) {
      return { ok: false, error: 'sendMessage: from_number must be a registered E.164 number' };
    }
    const hasContent = typeof input.content === 'string' && input.content.length > 0;
    const hasMedia = typeof input.mediaUrl === 'string' && input.mediaUrl.length > 0;
    if (!hasContent && !hasMedia) {
      return { ok: false, error: 'sendMessage: either content or mediaUrl is required' };
    }

    const body: Record<string, string> = { number: input.number, from_number: fromNumber };
    if (hasContent) body['content'] = input.content as string;
    if (hasMedia) body['media_url'] = input.mediaUrl as string;
    if (input.sendStyle) body['send_style'] = input.sendStyle;
    if (input.statusCallback) body['status_callback'] = input.statusCallback;
    if (input.seatId) body['seat_id'] = input.seatId;

    const started = Date.now();
    console.log(
      `${SENDBLUE_LOG_PREFIX} sendMessage start to=${redactPhone(input.number)} from=${redactPhone(fromNumber)} hasContent=${hasContent} hasMedia=${hasMedia} style=${input.sendStyle ?? '<none>'}`,
    );

    let raw: string;
    let httpStatus: number;
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'sb-api-key-id': creds.apiKeyId,
          'sb-api-secret-key': creds.apiSecretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      raw = await res.text();
      if (!res.ok) {
        console.error(
          `${SENDBLUE_LOG_PREFIX} sendMessage http-error status=${httpStatus} durationMs=${Date.now() - started} bodyChars=${raw.length}`,
        );
        // Surface a structured error message if the body is JSON.
        let parsedErr: MessageResponse | undefined;
        try {
          parsedErr = MessageResponseSchema.parse(JSON.parse(raw));
        } catch {
          /* non-JSON error body */
        }
        const result: SendMessageResult = {
          ok: false,
          error: `Sendblue HTTP ${httpStatus}`,
          httpStatus,
        };
        if (parsedErr) result.response = parsedErr;
        return result;
      }
    } catch (err) {
      console.error(
        `${SENDBLUE_LOG_PREFIX} sendMessage network-error durationMs=${Date.now() - started} message=${(err as Error)?.message ?? String(err)}`,
      );
      return { ok: false, error: `Sendblue request failed: ${(err as Error)?.message ?? String(err)}` };
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      console.error(`${SENDBLUE_LOG_PREFIX} sendMessage invalid-json bodyChars=${raw.length}`);
      return { ok: false, error: 'Sendblue returned non-JSON body', httpStatus };
    }

    const parsed = MessageResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`${SENDBLUE_LOG_PREFIX} sendMessage schema-mismatch issues=${parsed.error.issues.length}`);
      return { ok: false, error: 'Sendblue response failed schema validation', httpStatus };
    }

    const response = parsed.data;
    const durationMs = Date.now() - started;
    if (response.status === 'ERROR') {
      console.error(
        `${SENDBLUE_LOG_PREFIX} sendMessage api-error status=ERROR errorCode=${String(response.error_code ?? '<none>')} durationMs=${durationMs}`,
      );
      return {
        ok: false,
        error: response.error_message ?? 'Sendblue reported ERROR status',
        httpStatus,
        response,
      };
    }

    console.log(
      `${SENDBLUE_LOG_PREFIX} sendMessage done status=${response.status} handle=${response.message_handle ?? '<none>'} durationMs=${durationMs}`,
    );
    return { ok: true, status: response.status, response };
  }

  return { sendMessage };
}

/**
 * Convenience: send a login magic-link / code to a phone number. Thin wrapper so the auth
 * flow reads intent-first. `link` may be a URL or a short code.
 */
export async function sendLoginLink(
  client: SendblueClient,
  to: string,
  link: string,
  opts: { appName?: string; statusCallback?: string } = {},
): Promise<SendMessageResult> {
  const appName = opts.appName ?? 'your game';
  const content = `Sign in to ${appName}: ${link}`;
  const input: SendMessageInput = { number: to, content };
  if (opts.statusCallback) input.statusCallback = opts.statusCallback;
  console.log(`${SENDBLUE_LOG_PREFIX} sendLoginLink to=${redactPhone(to)} appName=${appName}`);
  return client.sendMessage(input);
}

/**
 * Convenience: send a multiplayer game invite. Uses a celebratory iMessage effect when the
 * recipient is on iMessage (gracefully ignored on SMS fallback).
 */
export async function sendMultiplayerInvite(
  client: SendblueClient,
  to: string,
  inviteUrl: string,
  opts: { inviterName?: string; gameName?: string; statusCallback?: string } = {},
): Promise<SendMessageResult> {
  const inviter = opts.inviterName ?? 'A friend';
  const game = opts.gameName ?? 'a game';
  const content = `${inviter} invited you to play ${game}! Join: ${inviteUrl}`;
  const input: SendMessageInput = { number: to, content, sendStyle: 'confetti' };
  if (opts.statusCallback) input.statusCallback = opts.statusCallback;
  console.log(`${SENDBLUE_LOG_PREFIX} sendMultiplayerInvite to=${redactPhone(to)} game=${game}`);
  return client.sendMessage(input);
}
