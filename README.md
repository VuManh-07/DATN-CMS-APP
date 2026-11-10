# CMS — Card Management System

Implementation of `../PLAN-CMS.md`: a server that acts as the SCP03 key
authority and holds the card lifecycle, plus a desktop terminal that lets an
operator personalise cards through a GUI instead of running scripts.

```
cms/
  cms-server/    Express + TypeScript + MongoDB + Redis
  cms-desktop/   Electron + React + antd (operator terminal)
```

The three original demos (`demo-scp03`, `Demo-Smartcard`,
`Demo-coldwallet-appdesktop`) are left untouched for comparison.

## Architecture

```
cms-desktop (operator)              cms-server (key authority)        Card
  PC/SC reader                        Mongo: cards, users, audit
      |                               Redis: live SCP03 session
      |-- SELECT / INITIALIZE UPDATE ------------------------------->|
      |<- card challenge -------------------------------------------|
      |-- POST /scp03/initHostSCP03 -->| derives session keys
      |<- EXTERNAL AUTHENTICATE APDU --|
      |-- send to card --------------------------------------------->|
      |-- POST /scp03/wrap  ---------->| encrypt + CMAC
      |<- wrapped APDU ----------------|
```

**The desktop app never sees a key.** It moves APDU hex between the card and
the server. This is why `Demo-coldwallet-appdesktop/process/card/scp03.ts` was
deliberately *not* ported — it would have been a third copy of the algorithm
holding keys on the client.

## Quick start (no database to install)

```bash
cd cms-server && yarn install && yarn dev:standalone
cd cms-desktop && yarn install && yarn start
```

`dev:standalone` boots an in-memory MongoDB, seeds demo data, and starts the
API on port 1255. Sign in to the desktop app with:

| User | Password | Role |
|---|---|---|
| `admin` | `123@` | SUPER_ADMIN — full access |
| `manager` | `123@` | ADMIN |
| `operator` | `123@` | OPERATOR |
| `auditor` | `123@` | AUDITOR — read-only |

The seed creates 4 admins, 10 cardholders, 13 cards covering every lifecycle
state, 3 key sets, a half-finished batch, plus the ~55 history and ~59 audit
rows those transitions generate. Cards are driven through the real
`transition()` path, so every timeline and audit entry is genuine rather than
inserted wholesale.

Two caveats by design: data is discarded when the process exits, and Redis is
not started — only live SCP03 card sessions need it, and those need a physical
reader anyway. The first run downloads a `mongod` binary (~100 MB).

Log in as `auditor` to see the RBAC difference: every action button disappears.

## Setup (persistent database)

### 1. cms-server

Needs MongoDB and Redis reachable.

```bash
cd cms-server
yarn install
cp .env.example .env     # then edit it
yarn seed                # creates the bootstrap SUPER_ADMIN
yarn server:dev
```

`.env` is gitignored. Set `KEK_HEX` to 32 random bytes in hex — it wraps the
SCP03 master keys at rest:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then sign in and create a key set (Key management screen, or
`POST /api/v1/keysets`). Cards created afterwards pick up the oldest ACTIVE key
set automatically.

### 2. cms-desktop

```bash
cd cms-desktop
yarn install
cp .env.example .env     # CMS_API_BASE_URL, default http://localhost:1255/api/v1
yarn start
```

### Native module setup (PC/SC)

`smartcard` → `@pokusew/pcsclite` is a **native addon** and is listed under
`optionalDependencies`: install succeeds without it, and the app runs
with card features disabled (the header shows *PC/SC unavailable*). Everything
that does not touch a card — login, card records, lifecycle, audit, reports —
works in that mode.

Seeing this during install is expected and **not** a failure — the install
still reports success:

```
gyp ERR! find VS - found VC++ toolset: v143
gyp ERR! find VS - missing any Windows SDK
warning Error running install script for optional dependency: ... @pokusew/pcsclite
```

`node-gyp` needs the C++ toolset **and** a Windows SDK. Having only the toolset
(the common case after installing VS with just "C++ core features") fails at
the `configure` step with exactly the message above.

Fix it by adding a Windows SDK to the existing Visual Studio install:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe" modify `
  --installPath "C:\Program Files\Microsoft Visual Studio\2022\Community" `
  --add Microsoft.VisualStudio.Component.Windows11SDK.22621 `
  --includeRecommended
```

(or: Visual Studio Installer → Modify → Individual components → *Windows 11
SDK*). Verify with `ls "C:\Program Files (x86)\Windows Kits\10\Include"` —
it should list at least one version. Then rebuild the addon:

```bash
cd cms-desktop
yarn add smartcard
npx electron-rebuild -f -w smartcard   # rebuild for Electron's ABI, not Node's
```

`electron-rebuild` is the step people miss: the addon compiled for Node 22 will
not load in Electron, which uses a different ABI.

Confirm it worked: start the app, insert a card, and the header should show
*Reader connected / Card present*.

## Card simulation (no reader, no chip)

Set `MOCK_CARD=1` in `cms-desktop/.env` and the terminal runs against a
**virtual card**: the reader reports *Virtual PC/SC Reader (mock)* with a card
already inserted, and application APDUs are answered in-process by
`process/card/virtualCard.ts`.

What is faked and what is not:

| Faked | Still real |
| --- | --- |
| The PC/SC reader and the chip | Card records, create / personalize / lifecycle |
| SCP03 (no `/scp03/*` calls at all) | The personalization plan from the server |
| Application APDU responses | Per-step results, `personalize/complete`, audit log |

So the wizard, batch mode, the lifecycle transitions and the audit trail are all
exercised against the real `cms-server` — only the chip is missing. The
simulated chip implements the applet's command table: status, card identity,
seed generate / import, PIN verify and change, accounts, tokens, networks,
signing (real secp256k1 — the signatures verify) and both reset commands.

A **Simulated card** panel appears on *Personalize* and *Batch mode*, and the
header carries a purple *Simulated card* tag. From the panel:

- **Insert / Remove card** — simulate seating the card, including pulling it out
  mid-run to see the session abandoned.
- **Blank chip** — a factory-fresh chip with a **new CSN**, which is how batch
  mode gets a second, third, fourth card.
- **Pre-loaded chip** — a new chip that already holds the test wallet, standing
  in for a card someone else personalized.
- **PIN / tries left / applet status** — force the awkward states: a chip locked
  by wrong PINs (`tries left = 0`), or one that already carries a wallet.

Two environment variables tune it:

- `MOCK_CARD_STATE` — where the chip persists. Both desktop apps default to
  `~/.coldwallet-mock/card.json`, **the same file**, so a card personalized
  here is the card the wallet app then opens, PIN and seed included.
- `MOCK_CARD_CSN` — pin the CSN instead of minting a new one per blank chip.
- `MOCK_CARD_PROVISIONED=0` — make the *first* simulated card blank. It defaults
  to carrying the test wallet, because the wallet app cannot get past its login
  screen with a chip that holds no wallet.

The simulator is for testing the terminal and the server. It holds no real keys
and its secp256k1 is a plain BigInt implementation — never point it at a
production CMS.

## Troubleshooting

**Desktop window is blank / white.** Open the terminal running `yarn start` —
renderer errors are forwarded there (see `process/electron/main.ts`), and
DevTools opens automatically in dev. Two causes hit during development:

- `ReferenceError: __dirname is not defined`, with
  `Unable to load preload script`. `@vercel/webpack-asset-relocator-loader`
  injects a runtime line referencing `__dirname`, which exists in the main
  process but not in a sandboxed renderer or preload. The loader is therefore
  scoped to the main config only — see `nativeModuleRules` in
  `webpack.rules.ts`. If you copy loader rules from another Electron project,
  check this first.
- A stale build. `yarn start` does not always pick up webpack config changes;
  `rm -rf .webpack` and start again.

**Server returns `buffering timed out after 10000ms`.** Mongoose queued a query
while not connected. It is a symptom, not the cause — read the lines above it
for the real connection error.

**`querySrv ECONNREFUSED` on a `mongodb+srv://` URL.** Node resolves SRV
records through c-ares with its own server list, not the OS resolver. Where it
cannot read the system config it falls back to `127.0.0.1`, and SRV lookups
fail even though ordinary hostname lookups (and therefore Redis) work fine.
Set `DNS_SERVERS=8.8.8.8,1.1.1.1` in `.env`; `helpers/dnsConfig.ts` applies it
and otherwise warns. Checking `node -e "console.log(require('dns').getServers())"`
confirms the diagnosis.

**Port already in use.** `ts-node-dev` watches `.ts` files but not `.env`, so a
server started before an `.env` edit keeps the old config and still answers
`/health` — making a broken setup look healthy. Restart it after editing `.env`.

## Role model

| Role | Can do |
|---|---|
| `AUDITOR` | Read everything, including audit logs. No writes, no card access. |
| `OPERATOR` | Personalise, issue, activate, lock, unlock, suspend; open SCP03 sessions. |
| `ADMIN` | The above plus cardholders, card records, revoke, replace, rotate-key. |
| `SUPER_ADMIN` | Everything, including creating and deprecating key sets. |

`requireRole()` lets `SUPER_ADMIN` through every guard, so new routes do not
have to list it.

## Card lifecycle

```
CREATED ──> PERSONALIZING ──> PERSONALIZED ──> ISSUED ──> ACTIVE
                  │                                          │
                  └──> PERSONALIZE_FAILED ──┐          ┌─────┼─────┐
                            (retry) ────────┘       LOCKED SUSPENDED│
                                                       │        │   │
                                                       └── ACTIVE ──┘
ISSUED / ACTIVE / LOCKED ──> PERSONALIZING   (re-personalize, key rotation, kvn++)
any live state           ──> REVOKED         (terminal)
any live state           ──> EXPIRED         (terminal, hourly job)
```

`src/services/cardLifecycle.service.ts` holds the transition table and the one
`transition()` function every state change goes through. It is the only place
that writes `cardstatehistory` and the matching audit row, so a state change
without an audit trail is not expressible. Replacement links the old and new
card in both directions, and a cardholder may hold only one live card at a
time (enforced when a card becomes `ISSUED`).

## Issues found in the original demos, fixed here

While porting, several real defects turned up in `demo-scp03`. They are fixed
in `cms-server`, but **the originals still have them**:

1. **Committed secrets** — `demo-scp03/.env` contains live Mongo Atlas and
   Redis Cloud credentials, and `wallet-js/third_party/Install.js` hardcodes a
   `secret-key` header. Those credentials should be rotated; gitignoring the
   file is not enough once it is in history.
2. **Unauthenticated API** — the `apiKey` / `checkPermission` middleware was
   commented out in `routes/index.ts`, leaving every endpoint open. Here all
   routes sit behind `authenticate` plus a role guard.
3. **Shared ECDH state** (`services/ECDH.service.ts`) — one `ECDHServer`
   instance served every request, so each new `hostChallenge` overwrote
   `sharedKeyBase64` and concurrent operators corrupted each other's sessions.
   The secret now lives with the session in Redis and is passed into
   `encrypt`/`decrypt`. The raw ECDH output also went straight in as an AES
   key; it is now run through HKDF-SHA256.
4. **Shared secret erased on first update** (`models/repo/scp03.repo.ts`) —
   `updateScp03Init` wrote `updatedData.SharedSecret` (capital S), which is
   undefined on the `Scp03` class, so the secret was wiped on the first call
   after `hostChallenge`. Fixed to `sharedSecret`.

Also: SCP03 keys were hardcoded to the GlobalPlatform test key
(`404142…4F`) in the controller with the DB lookup commented out — replaced by
the key-set loader; `jest` was configured against a `jest.config.js` that did
not exist, with no tests — there is now a config and a lifecycle test suite.

Four more surfaced while building the demo seed, which exercises the services
the way the UI does:

5. **`BadRequestError` returned 403** (`core/error.response.ts`) — it defaulted
   to `FORBIDDEN`, conflating "your request is invalid" with "you are not
   allowed". Clients need those apart: the first is worth showing the operator,
   the second means the UI offered an action it should have hidden. Now 400.
6. **Redis loss killed the process** (`dbs/redis.init.ts`) — the reconnect
   watchdog did `throw` inside a `setTimeout`, which no caller can catch and
   which takes the process down. Redis only holds live SCP03 sessions, so
   losing it now logs and degrades. The client also had no `error` listener,
   making a failed connection an unhandled `error` event.
7. **`transition()` only accepted ObjectIds** — it was typed to take a string
   id, but cards carry two identifiers and operators use the readable
   `cardId`. Passing one threw a `CastError`. Both forms now resolve, through a
   single `resolveCard()` that `card.service` shares.
8. **Duplicate Mongo index** on `users.nationalId` (declared with both
   `index: true` and `schema.index()`), which Mongoose warns about on boot.

Carried over from the wallet demo and fixed in `cms-desktop`: the card layer
kept session state in module-level globals and auto-opened a secure channel
500 ms after every `card-inserted`. Both are wrong for batch mode and for a
wizard with a confirmation step, so sessions are now `CardSession` instances
and channels open only when asked.

## Verification

### Server

```bash
cd cms-server
yarn test       # lifecycle transition table — 12 tests
```

With `yarn dev:standalone` running, these all hold (verified):

| Check | Result |
|---|---|
| `GET /health` | 200 |
| Login as each of the 4 seeded roles | 200 + token |
| `GET /reports/dashboard` | counts across all 10 states |
| `CREATED → ACTIVE` (skips personalization) | **400** `Illegal transition CREATED -> ACTIVE. Allowed: PERSONALIZING` |
| `REVOKED → ACTIVE` | **400** `Card is in terminal state REVOKED and cannot be changed` |
| `AUDITOR` POST anything | **403** |
| `OPERATOR` POST `/keysets` | **403** |
| `AUDITOR` GET `/audit-logs` | 200 |
| No token | **401** |
| `GET /keysets` response | contains no `encryptedKeyBlob` or `Key_*` |

Then exercise the API (replace `$T` with the access token from login):

```bash
# login
curl -s localhost:1255/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123@"}'

# happy path
curl -s -X POST localhost:1255/api/v1/users   -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"fullName":"Nguyen Van A","nationalId":"001"}'
curl -s -X POST localhost:1255/api/v1/cards   -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"userId":"<id>"}'
curl -s -X POST localhost:1255/api/v1/cards/<cardId>/personalize/start    -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{}'
curl -s -X POST localhost:1255/api/v1/cards/<cardId>/personalize/complete -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"success":true}'
curl -s -X POST localhost:1255/api/v1/cards/<cardId>/issue    -H "Authorization: Bearer $T"
curl -s -X POST localhost:1255/api/v1/cards/<cardId>/activate -H "Authorization: Bearer $T"
```

Checks worth running explicitly:

- Every step above adds one `cardstatehistory` row **and** one `auditlogs` row.
- `CREATED → ACTIVE` (skipping personalization) returns 400.
- `REVOKED → ACTIVE` returns 400 — revoked is terminal.
- Issuing a second card to a cardholder who already holds a live one returns 400.
- An `OPERATOR` token calling `POST /keysets` returns 403; an `AUDITOR` token
  returns 403 on every POST.
- `GET /keysets` never includes key material in the response.

### Desktop

Without a reader (`PC/SC unavailable`): login, card list, card detail,
lifecycle buttons, audit log and dashboard are all exercisable.

With a reader and a card:

1. Insert a card — the header shows *Card present*, and the wizard's step 1
   reads a CSN matching what JCShell reports.
2. Run the Personalize wizard end to end. Compare the APDU trace panel with the
   console output of the original `wallet-js` run — they should match.
3. Pull the card mid-run: the app must report a clear error and leave the card
   in `PERSONALIZE_FAILED`, not hang.
4. Lock a card from the UI, then confirm `state=LOCKED` and `lockReason` in Mongo.
5. Batch mode with 3 cards, forcing one to fail → `personalizedCount=2`,
   `failedCount=1`.
6. `yarn make` produces an installer; install on a clean machine with a
   reader and confirm the native module still loads.

## Not implemented

**Applet (CAP) installation.** The wizard assumes the card already carries the
applet; step 3 of the plan is left out pending a decision between spawning NXP
JCShell with a generated script (low risk, reuses `uploadapplet.jcsh`) and
implementing GP LOAD/INSTALL with `node-gp` (cleaner, but `node-gp` is unused
anywhere in the repo today). `JCSHELL_PATH` is reserved in `.env.example` for
the first option.
