# Sendblue API Reference (verified against docs.sendblue.com)

> Researched 2026-06-06. Sendblue = REST API for sending/receiving **iMessage** (with automatic SMS/MMS fallback) and RCS. Used here as the messaging/notification channel (`engine/auth/sendblue.ts`).
> Keys from https://dashboard.sendblue.com. Official Node.js SDK exists; plain fetch works fine.

## Auth (headers on every request)

```
sb-api-key-id: <API_KEY_ID>
sb-api-secret-key: <API_SECRET_KEY>
Content-Type: application/json
```

Store as env vars (`SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`) — never client-side; call from Vercel functions only.

## Send a message

`POST https://api.sendblue.co/api/send-message`

| Field | Type | Req | Notes |
|---|---|---|---|
| `content` | string | ✅* | message text (*either content or media_url) |
| `from_number` | string | ✅ | a registered Sendblue number, E.164 |
| `number` | string | ✅ | recipient, E.164 (e.g. `+19998887777`) |
| `media_url` | string | – | image/video URL (MMS) |
| `send_style` | string | – | iMessage effect: celebration, shooting_star, fireworks, lasers, love, confetti, balloons, spotlight, echo, invisible, gentle, loud, slam |
| `status_callback` | string | – | webhook URL for delivery status updates |
| `seat_id` | string | – | sending user (seat UUID or Firebase Auth subject) |

```ts
const res = await fetch('https://api.sendblue.co/api/send-message', {
  method: 'POST',
  headers: {
    'sb-api-key-id': process.env.SENDBLUE_API_KEY_ID!,
    'sb-api-secret-key': process.env.SENDBLUE_API_SECRET_KEY!,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    number: '+19998887777',
    from_number: process.env.SENDBLUE_FROM_NUMBER,
    content: 'Your game finished generating! 🎮',
    status_callback: 'https://yourapp.vercel.app/api/sendblue-status',
  }),
});
```

Response (`MessageResponse`): echoes the request plus `status` (`QUEUED` | `SENT` | `DELIVERED` | `ERROR`), `message_handle`, `date_created`, `date_updated`, `error_code`, `error_message`, `sender_email`, `account_email`.

## Other endpoints

- `POST /api/send-group-message` — group messages.
- Inbound messages + delivery statuses arrive via **webhooks** you configure (dashboard or `status_callback`).
- API v2 exists (https://docs.sendblue.com/api-v2/) — check it when implementing; resource-style routes.

## Notes

- Automatic iMessage→SMS fallback when recipient lacks iMessage.
- Supports reactions, read receipts, typing indicators.
- Numbers must be E.164 throughout.

## Sources
- https://docs.sendblue.com/api/resources/messages/methods/send/
- https://docs.sendblue.com/getting-started/sending-messages
- https://docs.sendblue.com/api-v2/
