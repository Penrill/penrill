# Connecting Penrill to a server

Status: phase 1 implemented (device linking, claim, invites, web admin, CLI, LAN pinning, packages); phases 2 and 3 are design. Covers the editor (this repo) and Penrill Server
(`penrill-server`, FSL). The hosted address service behind "Penrill address" lives in
`penrill-cloud/docs/ADDRESSES.md`; this document only describes the open protocol a server uses
to talk to it.

## Goals

1. Nobody types a password into the editor. Connecting a device is one button plus one click in a
   browser.
2. A self-hosted server needs no manual: install one package, open the link it prints, done.
   No SSH tunnels, no SQL, no config files for the normal cases.
3. The same flow works for Penrill Cloud, a Raspberry Pi at home and a VPS.
4. Self-hosted never depends on Penrill Cloud. The Penrill address is an optional add-on.

## What is wrong today

| Today | Problem |
|---|---|
| Address, username and password form in the editor | The editor handles passwords; typing a server URL is error prone |
| Server listens on 127.0.0.1 only, README suggests `ssh -L` | Unusable for anyone who is not a developer |
| HTTPS required except loopback, no certificate story | A LAN server cannot be reached at all without a tunnel |
| Open registration on any server | Anyone who reaches the port gets an account |
| Restoring board ownership by hand-written SQL | Admin tasks need a shell and SQLite knowledge |
| Package for arm64 only | A DigitalOcean droplet is amd64 |
| Sessions expire after 30 days | A synced laptop silently stops syncing after a month |

## Overview

```
 editor ──(1) start link──────────────▶ server
   │  opens browser at /link?code=WDJB-MJHT
   ▼
 browser ──(2) sign in, "Allow MacBook"──▶ server
 editor ──(3) poll───────────────────────▶ server ──▶ device token
```

Three independent pieces, each usable without the others:

- **Device linking** (both server and cloud): how an editor gets a token.
- **Server lifecycle** (server only): install, first-run claim, invites, admin UI, CLI.
- **Reachability** (server only): how the editor finds the server and trusts its certificate.

## 1. Device linking

Follows the OAuth 2.0 Device Authorization Grant (RFC 8628), simplified for a first-party client.
Chosen over a loopback redirect (RFC 8252) because it needs no local port and no protocol
handler, so it also works in the strict snap, behind a firewall and from a headless CLI.

### Credentials

Today a password sign-in creates a 30 day session. Linking creates a **device token** instead:

| | Session (web) | Device token (editor) |
|---|---|---|
| Created by | password sign-in on the web UI | an approved link request |
| Transport | `HttpOnly; Secure; SameSite=Strict` cookie | `Authorization: Bearer` |
| Lifetime | 30 days, sliding | until revoked |
| Shown to the user | no | yes, by device name and last use, with "Revoke" |

Both are rows of one `credentials` table (`token_hash, user, kind, device, created, last_used,
expires`), so `BearerSessionHandler` and live socket checks stay one lookup. Existing session rows
migrate as `kind = 'session'`, so old editors keep working until their session expires.

### Endpoints (Penrill.Api, shared by server and cloud)

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/link/start` `{ device, app }` | none, rate limited | creates a request, returns `deviceCode`, `userCode`, `verifyUrl`, `expiresIn` |
| `POST /api/link/poll` `{ deviceCode }` | none | long poll up to 15 s (editors time out at 20 s): `200 { name, token }`, `202` pending, `403` denied, `410` expired |
| `GET /api/link/{userCode}` | web session | what is asking: device name, app version, request time, IP |
| `POST /api/link/{userCode}` `{ allow }` | web session | approve or deny |
| `GET /api/devices`, `POST /api/devices/{id}/revoke` | any credential | list and revoke own devices |
| `GET /api/server` | none | name, registration mode, pin; tells the editor this is a Penrill server |

- `deviceCode`: 32 random bytes, only its hash is stored, never shown.
- `userCode`: 8 characters from `BCDFGHJKLMNPQRSTVWXZ` (no vowels, no look-alikes), shown as
  `WDJB-MJHT` in both the editor and the approval page so the user can compare.
- Requests expire after 10 minutes and are single use. Polling a consumed request returns `410`.
- The approval page belongs to the host, not to Penrill.Api: the server renders it in its web
  UI, the cloud in its workspace. The API only exposes the JSON above.

The request is a small state machine (State pattern) owned by `LinkService` in Penrill.Core:

```
pending ──allow──▶ approved ──poll──▶ consumed
   │ deny              │
   ▼                   └─expire─▶ expired
 denied
```

Keeping the transitions in one class means the HTTP layer cannot, for example, hand out a token
twice or approve an expired request.

### Editor side

`SyncPage` becomes a list of connections instead of a form:

```
Sync
  This device only                         (selected)
  Penrill Cloud                 [Connect]
  Your server                   [Connect]  → address field, pasted link or a LAN server found nearby
```

Pressing Connect runs a `ConnectFlow` (state machine in `src/renderer/src/sync/connect.ts`):
`resolving → starting → waitingForApproval(userCode) → connected | failed(reason)`.
The editor opens `verifyUrl` with `shell.openExternal` (desktop) and shows the code with
"Waiting for you to allow this device in the browser" and a Cancel button.

Tokens move from `localStorage` to the main process, encrypted with Electron `safeStorage`
(Keychain, DPAPI, libsecret). The renderer only learns the account name and whether a token
exists; `sendHttp` in main attaches the token. This also removes tokens from devtools reach.

The web edition on Penrill Cloud is same-origin and keeps signing in with the cookie session.

### Connect links

Any place that wants to connect an editor hands it a link carrying no secret:

```
penrill://connect?server=https://pi.local:5081&pin=sha256/3Fq...
https://penrill.com/connect#server=https://pi.local:5081&pin=sha256/3Fq...
```

- `penrill://` is registered by the desktop app (`protocols` in `electron-builder.yml`,
  `x-scheme-handler/penrill` on Linux, `open-url` on macOS, `second-instance` argv elsewhere).
- Servers never decide between the app and the browser: they do not know what the visitor has.
  Their home page leads with the address to enter in Penrill (Sync › Your server) and links to
  `https://penrill.com/connect`, which lets the visitor pick the app (`penrill://`), Penrill in
  the browser (`https://app.penrill.com/#server=…`, which starts connecting by itself) or the download. It never
  opens `penrill://` on its own, since Safari answers an unknown scheme with an error dialog.
  On tablets and phones it offers only the browser. Parameters are in the fragment, so
  penrill.com never receives the server address. This is also the form printed as a QR code,
  since phone cameras do not open custom schemes. `PENRILL_CONNECT_PAGE` points it elsewhere
  (a local web editor in development).
- Penrill in the browser reaches a server with its own certificate only after the browser has
  accepted that certificate once, so the web app says so when such a server is unreachable.
  Servers allow `https://app.penrill.com` (and, for older links, `https://penrill.com`) in CORS and answer Chrome's Private Network Access preflight.
- Opening a connect link only pre-fills the server and starts device linking. Because the link
  holds no secret, a forged one can at worst start a link request the user then has to approve
  on a page served by that same server.

## 2. Server lifecycle

### Install

```
curl -fsSL https://penrill.com/server.sh | sh
```

The script detects the distro and architecture, adds the signed Penrill apt repository, installs
`penrill-server`, starts the service and prints the setup link. Every step is also documented for
people who do not pipe to `sh`.

Packages:

| Artifact | Phase |
|---|---|
| `.deb` for amd64 and arm64, self-contained .NET | 1 |
| apt repository `https://apt.penrill.com`, signed, built by the release workflow | 2 |
| Docker image `ghcr.io/penrill/server` (NAS, Unraid, existing Docker hosts) | 2 |
| Snap `penrill-server` | later, if people ask |
| DigitalOcean Marketplace 1-Click | later |

### First run: claiming the server

On first start, with no owner account, the server creates a **claim token** (random, stored
hashed, valid until used) and prints:

```
Penrill Server is running.
Finish setup on any device in this network:

  https://192.168.1.20:5081/setup#k=Zq4...      (or scan)
  ▄▄▄▄▄▄▄ ▄ ▄▄ ...
  Certificate fingerprint: 0CA7-1F5D-DDE9
```

The same text goes to the journal, to `/var/lib/penrill-server/setup.txt` (root only) and is
shown again by `sudo penrill-server setup`. The token is in the fragment so it does not end up in
proxy logs.

The setup page asks for:

1. Owner username and password.
2. Server name (defaults to the hostname), shown in editors and on the LAN.
3. How people reach it (see section 3): this network only, my domain, Penrill address, behind my
   own reverse proxy.

It finishes on a page with **Connect this computer** (a connect link) and a QR code of the same
link for other devices.

### Accounts and invites

Registration is closed. The only ways to get an account:

- The claim (first owner).
- An **invite link** `https://server/invite/<token>`, created in the admin UI or with
  `penrill-server invite`. Single use by default, optional expiry and use count. The invite page
  creates the account and ends with the same Connect button.

Roles: `owner` (exactly one, can transfer), `admin`, `member`. `POST /api/register` is removed;
`/api/login` stays for the web UI only.

Password reset needs no email: an admin (or `penrill-server reset-password ann`) creates a one-time
reset link, valid for one hour.

### Web admin

Served by the server itself at `/admin`, cookie session, admins only. Pages:

| Page | Replaces |
|---|---|
| Users: invite, change role, disable, reset link | open registration, SQL |
| Devices: every device token per user, last used, revoke | nothing (did not exist) |
| Boards without owner: assign to a user | the SQL in the README |
| Server: name, address mode, certificate status and fingerprint, version | config files, `systemctl` |
| Backup: download a consistent archive (`VACUUM INTO` + assets), restore | copying files by hand |

Members get a small `/account` page: change password, own devices.

### CLI

The same binary is the CLI. Commands talk to the running service over a Unix socket
`/run/penrill-server/admin.sock` (mode 0600, root), so file permissions are the authentication
and the CLI never opens the database behind the service's back.

```
penrill-server status            address, certificate, users, boards, version
penrill-server setup             print the claim link and QR again
penrill-server link              print a connect link and QR
penrill-server invite [--admin]  print an invite link and QR
penrill-server reset-password U  print a reset link
penrill-server users | devices   list, with --revoke ID
penrill-server address ...       switch address mode (same choices as setup)
penrill-server backup FILE       write a backup archive
```

A full-screen TUI is not planned for phase 1; every command prints a link, so the browser is the UI.

Web admin and CLI call one `AdminService` (Facade) in Penrill.Core, and each CLI verb is a small
Command object sent over the socket. Adding an admin feature means one service method, one web
page and one command, and the two front ends cannot drift.

## 3. Reachability and trust

The address mode is chosen at setup and can be changed later. Each mode is a strategy behind two
interfaces in the server (Strategy pattern):

- `ICertificateSource`: gives Kestrel the current certificate (via `ServerCertificateSelector`,
  so renewal needs no restart) and its pin.
- `IAddressProvider`: tells the server which URL to put into links and keeps it valid.

| Mode | Certificate | URL in links | Phase |
|---|---|---|---|
| This network only | self-signed, long lived, pinned | `https://<lan-ip>:5081` | 1 |
| Behind my reverse proxy | none, plain HTTP on 127.0.0.1, trusts `X-Forwarded-*` from loopback | the public URL entered at setup | 2 |
| My domain | Let's Encrypt via ACME HTTP-01 on port 80, served on 443 | `https://board.example.com` | 2 |
| Penrill address | issued through the address service, see below | `https://<id>.penrill.net` | 3 |

### This network only: pinned certificate

The server generates an ECDSA P-256 key and a self-signed certificate on first run. Its pin is the
SHA-256 of the SubjectPublicKeyInfo (`sha256/<base64>`), so renewing the certificate with the same
key keeps the pin.

- Connect links carry `pin`. The editor stores it next to the origin and the Electron session's
  `setCertificateVerifyProc` accepts a certificate for that host only when the pin matches. A
  publicly trusted certificate is never required for a pinned origin, and a pinned origin never
  falls back to normal trust.
- The editor also finds servers on the LAN through mDNS (`_penrill._tcp`, announced by an Avahi
  service file the package installs, TXT `v`). A server reached without a pin is trust on first
  use: the editor shows a short fingerprint (the first six bytes of the pin in hex,
  `0CA7-1F5D-DDE9`) to compare with the setup page, Admin › Server or `penrill-server status`.
- In a plain browser the self-signed certificate shows a warning. The setup page and admin are
  still reachable after accepting it; the printed fingerprint lets the user check it. Avoiding the
  warning is what the Penrill address is for.

`serverOrigin()` keeps refusing plain HTTP except loopback.

### My domain

Setup asks for the domain, checks that it resolves to this machine (the server fetches its own
`/.well-known/penrill-check/<nonce>` through the domain), then orders the certificate. The
service gets `CAP_NET_BIND_SERVICE` for 80 and 443. Renewal runs in a hosted service 30 days
before expiry.

### Penrill address (optional, needs a Penrill account)

For people with no domain, behind a router or CGNAT. The server links itself to a Penrill Cloud
account with the same device flow as the editor (the server is the "device"; setup shows the code
and opens `cloud.penrill.com/link`). The address service then provides:

- a name `<id>.penrill.net` pointing at the server's public IP, or at the relay when the server
  is not reachable from outside;
- LAN names `192-168-1-20.<id>.penrill.net` resolving to the private IP, so the LAN path also
  has a trusted certificate (the plex.direct approach);
- a certificate for `<id>.penrill.net` and `*.<id>.penrill.net`, issued from a CSR: the private key
  never leaves the server;
- a relay: the server keeps one outbound tunnel; the relay forwards TLS by SNI without
  terminating it, so it sees neither boards nor tokens.

Open part, in penrill-server: the tunnel client, the `PenrillAddressProvider` and the protocol
below. Closed part, in penrill-cloud: DNS, certificate ordering, relay, quotas.

| Server to address service | Purpose |
|---|---|
| `POST /api/link/start` ... poll | link the server to an account (same flow as editors) |
| `POST /v1/servers/{id}/heartbeat` `{ publicIp, lanIps, port, version }` | DNS updates, reachability probe result in the answer |
| `POST /v1/servers/{id}/certificate` `{ csr }` | returns the chain |
| `GET /v1/servers/{id}/tunnel` (WebSocket) | relay tunnel, multiplexed TCP streams |

The editor does not know any of this exists: it receives an ordinary `https://` URL with a
publicly trusted certificate.

## Phases

1. **Linking and lifecycle, LAN.** Device tokens, link endpoints and state machine, approval page
   on server and cloud, claim and invites, roles, web admin, admin socket and CLI with QR,
   self-signed pinning and mDNS, `penrill://` and the connect page, new Sync page, tokens in
   `safeStorage`, amd64 and arm64 `.deb`.
2. **Public servers.** My domain (ACME), behind a reverse proxy, apt repository and install
   script, Docker image.
3. **Penrill address.** Address service, relay, LAN names, UPnP/NAT-PMP to avoid the relay where
   the router allows it.

## Open decisions

1. **Admin UI technology.** Razor Pages inside penrill-server styled like Catalyst (no JS build,
   the server repo stays self-contained) versus a React app from this repo using `@penrill/ui`
   (identical look, but the server build then depends on the editor build). Proposed: Razor.
2. **Device token lifetime.** Until revoked (proposed) versus long sliding expiry such as one year
   without use.
3. **Default LAN port.** Keep 5081 (proposed; no root needed) or 443.
4. **Relay limits.** Free with a bandwidth cap, or part of a paid plan. Affects only phase 3.
5. **Domain** for addresses (`penrill.net` or a subdomain of `penrill.com`). A separate domain
   keeps user servers off the main site's cookies and reputation.
