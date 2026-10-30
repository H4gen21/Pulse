# 14 — API Specification

The contract is the source of truth. The API only stores what the chain can't hold (heir emails and notification state) and caches vault status for fast reads.

Base path: `/api`. All bodies are JSON. All addresses are returned **lowercase**.

## Authentication

| Endpoint | Auth |
|---|---|
| `GET  /api/auth/csrf` | none. Returns `{ csrfToken }`, which is also used as the SIWE nonce |
| `POST /api/auth/callback/siwe` | SIWE `message` + `signature`; sets the `next-auth.session-token` cookie (httpOnly, JWT, 24h) |
| `GET  /api/auth/session` | cookie. Returns `{ address, expires }` |
| `GET  /api/vault` | public; heir emails are included only when the session wallet == `address` |
| `POST /api/vault` | **SIWE session required** (401 otherwise) |

The client never calls the auth endpoints directly: RainbowKit's authentication adapter in `app/providers.tsx` drives them.

## Error envelope

```json
{ "error": "Human readable message", "issues": { "fieldErrors": {}, "formErrors": [] } }
```
`issues` is only present on 400 (zod `flatten()` output).

| Status | Meaning |
|---|---|
| 400 | Body or query failed schema validation |
| 401 | No SIWE session |
| 409 | Guard is not active on-chain |
| 422 | Tx/beneficiaries don't match the chain (not a `setupGuard` by this wallet, or heir list mismatch) |
| 429 | Rate limited (GET 60/min/IP, POST 10/min/wallet) |
| 502 | RPC or database failure |

---

## `POST /api/vault`

Records a vault after the owner's `setupGuard` transaction is **mined**. The server:
1. Requires a SIWE session; `owner = session.address`.
2. Fetches the receipt for `txHash` and requires `status == success` plus a `GuardSetup` log emitted by `GUARD_ADDRESS` with `owner == session.address`.
3. Reads `guards(owner)` and `getBeneficiaries(owner)` from the chain. Timeout, token, BPS and order all come **from the chain**, never from the request.
4. Requires the request's wallet set to equal the on-chain wallet set, then attaches emails.
5. Upserts `Owner`, `Vault` (status `ACTIVE`) and `Beneficiary[]` in a single DB transaction, and queues one `GUARD_SETUP` `NotificationLog` per unique email (BR-06, idempotent via a unique key).

### Request schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["txHash", "beneficiaries"],
  "additionalProperties": false,
  "properties": {
    "txHash": { "type": "string", "pattern": "^0x[0-9a-fA-F]{64}$" },
    "beneficiaries": {
      "type": "array", "minItems": 1, "maxItems": 10,
      "items": {
        "type": "object",
        "required": ["walletAddress"],
        "properties": {
          "walletAddress": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
          "email": { "type": "string", "format": "email", "maxLength": 254 }
        }
      }
    }
  }
}
```

Example:
```json
{
  "txHash": "0x9f2c…e41a",
  "beneficiaries": [
    { "walletAddress": "0x1111…1111", "email": "alice@example.com" },
    { "walletAddress": "0x2222…2222" }
  ]
}
```

### Response `201 Created`

```json
{
  "vault": {
    "id": "cm3…",
    "ownerId": "cm3…",
    "chainId": 84532,
    "timeoutDuration": 15552000,
    "tokenAddress": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    "status": "ACTIVE",
    "lastPingAt": "2026-10-30T08:00:00.000Z",
    "txHash": "0x9f2c…e41a",
    "createdAt": "2026-10-30T08:00:05.000Z",
    "updatedAt": "2026-10-30T08:00:05.000Z",
    "beneficiaries": [
      { "id": "…", "position": 0, "walletAddress": "0x1111…", "bpsShare": 5000, "email": "alice@example.com", "hasBeenNotified": false },
      { "id": "…", "position": 1, "walletAddress": "0x2222…", "bpsShare": 5000, "email": null, "hasBeenNotified": false }
    ]
  }
}
```

---

## `GET /api/vault?address=0x…`

Public read used by `/verify` (Public/Auditor role) and the dashboard. Live fields (`status`, `timeoutDuration`, `lastPingAt`, beneficiaries) come from the contract; DB values fill in the history (`REVOKED` / `EXECUTED`).

### Query

| Param | Type | Required |
|---|---|---|
| `address` | `0x` + 40 hex (any case) | yes |

### Response `200 OK`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["owner", "chainId", "status", "beneficiaries"],
  "properties": {
    "owner": { "type": "string" },
    "chainId": { "type": "integer" },
    "status": { "enum": ["UNCONFIGURED", "ACTIVE", "REVOKED", "EXECUTED"] },
    "tokenAddress": { "type": ["string", "null"] },
    "timeoutDuration": { "type": ["integer", "null"], "description": "seconds" },
    "lastPingAt": { "type": ["string", "null"], "format": "date-time" },
    "expiresAt": { "type": ["string", "null"], "format": "date-time", "description": "lastPing + timeout; null unless ACTIVE" },
    "txHash": { "type": ["string", "null"] },
    "beneficiaries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["position", "walletAddress", "bpsShare"],
        "properties": {
          "position": { "type": "integer", "description": "last position receives dust (BR-03)" },
          "walletAddress": { "type": "string" },
          "bpsShare": { "type": "integer" },
          "email": { "type": ["string", "null"], "description": "owner session only" }
        }
      }
    }
  }
}
```

Example (anonymous viewer):
```json
{
  "owner": "0xabc…",
  "chainId": 84532,
  "status": "ACTIVE",
  "tokenAddress": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  "timeoutDuration": 15552000,
  "lastPingAt": "2026-10-30T08:00:00.000Z",
  "expiresAt": "2027-04-28T08:00:00.000Z",
  "txHash": "0x9f2c…e41a",
  "beneficiaries": [
    { "position": 0, "walletAddress": "0x1111…", "bpsShare": 3333 },
    { "position": 1, "walletAddress": "0x2222…", "bpsShare": 3333 },
    { "position": 2, "walletAddress": "0x3333…", "bpsShare": 3334 }
  ]
}
```

## Not in the API (by design)

- **Ping / revoke**: these are on-chain transactions signed by the owner. The DB learns about them from the event indexer (next item), not from client calls, so a client can't fake them.
- **Event indexer / notifier** (next milestone): a worker (Vercel Cron, or a Chainlink Log Trigger → webhook) watches `GuardSetup`, `Pinged`, `GuardRevoked` and `InheritanceExecuted`; updates `Vault.status` / `lastPingAt`; and sends `PENDING` `NotificationLog` rows. The `@@unique([eventType, eventTxHash, recipientEmail])` key enforces BR-06 even if events are replayed.
