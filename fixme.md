# fixme.md — Classroom run: 30 students, majority stuck on the pre-game screen

## Symptom

Run in a real classroom (30 students, teacher laptop as server, all clients on a
single router): when the round started, a few students got the categories screen
fine, but the majority stayed stuck on the screen right after building the avatar
(the `/play` waiting screen).

## Root cause (the design gap that makes it permanent)

The student UI only leaves the waiting screen when `state.round.status` changes to
`PLAYING` (`StudentGamePage.jsx:245` `roundHasStarted`; `CategoryList` only renders
then, `StudentGamePage.jsx:570`). `state` is updated by exactly four things:

1. the initial REST `playerState` (once, on first mount),
2. the `joinRoom` ack,
3. a pushed `roomState`,
4. `requestState` — called **only inside the STOP handler** (`StudentGamePage.jsx:417`).
   No poll, no watchdog.

`roomState` pushes are fire-and-forget: `io.to(...).emit` with **no ack**
(`backend/src/sockets/realtime.js:27-33`). A client that misses a single `roomState`
push (the one announcing `PLAYING`) stays stuck **until its socket physically
reconnects or the page is reloaded**. There is no server-side resend and no
client-side recovery.

The public screen already self-heals with a REST poll
(`PublicScreenPage.jsx:66`, `setInterval(load, 15_000)`). The student page has no
equivalent.

## Why the push is easy to miss at game start (load)

At round start the server fires three full `broadcastState` in quick succession —
`start()` -> `STARTING`, `syncCountdownReleased`, `beginPlaying` -> `PLAYING`
(`backend/src/services/round/lifecycle.js:163, 211, 277`). Each `broadcastState`
(`backend/src/services/round/shared.js:34`):

- runs **~15-17 DB queries** (`teacherState` + `publicState` + `playerStatesForRoom`
  each run their own `loadRanking`, which does 2 queries;
  `backend/src/services/viewService.js:182, 202, 263` — the ranking is computed 3x
  per broadcast),
- then **synchronously emits ~35 individual socket payloads** (30 students + teacher
  + screen) from a single Node process that is also serving the static bundle and
  (likely) MySQL on the same laptop.

Every student **join** (`backend/src/sockets/handlers.js:73-87`) and every **`ready`**
(`backend/src/sockets/handlers.js:138-143`) also triggers another full
`broadcastState`. So the minute before "iniciar", the server absorbs ~60 full
satellite broadcasts from the join/ready burst — saturating the Prisma pool and
stalling the event loop right when the `PLAYING` transition needs to reach everyone.

## The countdown adds a hard all-clients wait

`runRevealSequence` awaits `requestAck` on every player socket with a 1500 ms timeout
(`backend/src/services/round/lifecycle.js:192`, `backend/src/config/env.js:74`), and
only then is `revealAt = now + 3000` set (`lifecycle.js:202`). A few slow/polling
devices force the full timeout before anyone is released — the most congested
stretch of the session is where the server serializes on the slowest clients first.
Bounded, but tail latency stacked on top of the load above.

## Network reality (why "some fine, most stuck")

`transports: ["websocket", "polling"]` (`frontend/src/socket/socket.js:12`), host is
the laptop on a cheap router. Such routers drop/black-hole TCP under many concurrent
WebSocket flows, producing **half-open connections**: both sides believe they are
connected (the client never sees a disconnect, so it never re-emits `joinRoom` — the
one thing that would hand it the full state back). The server only detects the dead
peer after `pingInterval 20s + pingTimeout 25s`
(`backend/src/sockets/index.js:15-16`), and the client has no equivalent watchdog.
Missing the PLAYING push + half-open socket = stuck for the whole round.

## Fixes (by priority)

### 1. Student-side watchdog (highest leverage — fixes the permanent stuck)

- [x] **Add a watchdog to the student page.** While waiting (round `CREATED`/`READY`/
  `STARTING`) and/or whenever no `roomState` has arrived for ~N seconds while
  `connected`, re-request the authoritative state via `emitAck(socket, "requestState")`
  or the REST `playerState` — both endpoints already exist and return the full state.
  This turns any missed push into a seconds-long recovery instead of a stuck screen.
  *Implemented: `withTransitionRefresh` (14 transition events also trigger
  `requestState`) + 3 s periodic backstop in `StudentGamePage.jsx`; reconnect on
  failed refresh.*
- [ ] Same watchdog can also cover the footer "you are not in fullscreen" state so a
  silently-restarted round still picks up `PLAYING`.

### 2. Coalesce the burst + stop redundant ranking

- [x] Debounce/throttle the `broadcastState` triggered by join/`ready` (e.g. a
  100-200 ms window) so 30 quick signals don't fan out 30 full satellite broadcasts.
  *Implemented: `broadcastStateSoon` (150 ms coalescer) for join/ready/disconnect in
  `round/shared.js`; critical transitions keep the awaited immediate broadcast.*
- [x] Compute `loadRanking` and `playerStatesForRoom` **once** per `broadcastState`
  and reuse the result across `teacherState`/`publicState`/`playerStatesForRoom`
  instead of running the ranking 3x per broadcast (`viewService.js:182, 202, 263`).
  *Implemented: single `loadRoomBroadcastContext` pass shared via the `ctx` argument.*

### 3. Detect dead peers sooner so rejoin self-heals

- [x] Shorten `pingInterval`/`pingTimeout` (e.g. 10 s/15 s) in
  `backend/src/sockets/index.js`. *Implemented.*
- [x] Client-side "no event received in X seconds while `connected` -> force
  reconnect" timer, so half-open sockets rejoin and re-`joinRoom` sooner.
  *Implemented: 3 s staleness watchdog in `StudentGamePage.jsx` forces
  `disconnect()` + `connect()` when `requestState` also fails.*

### 4. Reliability for the PLAYING transition specifically

- [x] After the transition to `PLAYING`, re-push `roomState` to any player who did
  not ack (e.g. reuse `requestAck` accounting from
  `syncCountdownRequested` — `realtime.js:59-73`) instead of a single fire-and-forget
  broadcast. *Implemented as a simpler equivalent: `beginPlaying` schedules a
  `broadcastStateSoon` re-diffusion ~1.5 s after PLAYING (0 in tests) — catches those
  who got `roundStarted` but missed the `roomState` push, without ack round-trips.*

### 5. WebSocket flakiness check (cheap router)

- [x] **Make the transport configurable and test both modes in class.** Today it is
  hardcoded `["websocket", "polling"]` (`frontend/src/socket/socket.js:12`). Cheap
  routers black-hole long-lived WebSocket flows; if that proves to be the router's
  failure mode, force `["polling"]` in classroom mode — polling is a sequence of short
  HTTP exchanges, nothing persistent for the router to corrupt, and for 30 clients the
  extra latency is negligible. Keep websocket-first in dev; gate the choice behind an
  env var (`VITE_SOCKET_TRANSPORTS`) and A/B it in a real run. *Implemented via
  `resolveTransports()` reading `VITE_SOCKET_TRANSPORTS`, default unchanged.*
- [ ] Before assuming load is the culprit, verify the router is actually the flaky
  layer: watch the server log for a burst of `disconnect`/`playerLeft` at game start,
  and watch the teacher monitor for `connected` flapping. If drops cluster right at
  `PLAYING`, it's the router; if they correlate with slow DB times in the logs, it's
  the fan-out (fixes #2/#4).

### 6. Compression — smaller bundle, less airtime over the router

- [x] Add `app.use(compression())` in `backend/src/app.js` (gzip; enable brotli where
  supported). At game start ~30 phones download the JS/CSS bundle at nearly the same
  instant; the bundle is currently served uncompressed by `express.static`
  (`app.js:88`). Compression shrinks transfer severalfold, which means fewer router
  collisions and less tail latency at the exact moment the page loads.
  *Implemented; `frontend/dist` rebuilt (603 kB -> 208 kB gzip).*
- [ ] Rebuild `frontend/dist` after any change and confirm the served
  `Content-Encoding: gzip` in a classroom test (the stale-bundle warning in
  `app.js` covers forgetting the rebuild).

### 7. Process separation (optional — one computer, not a must-have)

- [ ] If the event-loop contention from serving the bundle to 30 phones ever shows up
  in measurements, move static serving out of Node: serve `frontend/dist` from
  nginx/caddy (or `npx serve` on another port) and keep the Node process for
  `/api` + `/socket.io` only. The laptop is still the single machine, but the bundle
  I/O stops touching Node's event loop. Modest win; do **not** attempt `cluster` +
  Socket.IO Redis adapter for 30 users — the bottleneck is redundant work (#2) and
  missing recovery (#1), not process count.

> Note on coalescing: the debounce of join/`ready` `broadcastState` and the
> "compute ranking once per broadcast" are item **#2** above.

---

## Milestone definition

The acceptance test for the next classroom run: **starting the round must bring
every connected student to the categories screen within a few seconds of
`PLAYING`, with no manual reloads.** A student who loads `/play` mid-round must also
land on the running round (this already works via REST fallback + rejoin; a
watchdog makes it reliable).

Note: the wiki (`testes.md`) warns that visual/real-time behaviour is exactly the
kind of thing a fully green unit suite misses — validate these changes in the real
classroom setup (many phones, one router), not just against `stop_test`.