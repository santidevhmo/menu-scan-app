# HANDOFF — iPhone crash when opening the Review screen (OPEN, but INSTRUMENTED)

**Status: OPEN — root cause NOT found. A crash reporter is now installed so the next
occurrence names the error.** Updated 2026-08-05 (eval 140) after a session that disproved most
of the first writeup. **Read the "CORRECTIONS" section before anything else** — the original
version of this file asserted three things that are now measured to be false, and each of them
will waste your session if you believe it.

---

## The symptom

On Santiago's physical iPhone: pick a photo from the library, tap the **small photo thumbnail at
the bottom-right of the camera screen**, and the app dies instantly. His report note:
*"Nikkori menu crash"*. Crash at 2026-08-05 19:55:30 local, TestFlight build 3 (`bd124d6`).

---

## ⚠ CORRECTIONS to the first writeup (all measured this session)

| Original claim | Reality |
|---|---|
| "Reproduces reliably" | **FALSE. It is RARE — one failure in six-plus runs of the same flow.** The same Nikkori photo scanned fine on the same phone 12 minutes later (`scan_log` id 4, 48 dishes) and repeatedly since |
| The crash is on the submit/"Analyze Menu" button | **FALSE.** Santiago confirmed it was the **thumbnail** that opens Review. `extractMenu` never runs on that tap |
| Leading hypothesis: HEIC mime-type guess in `analyzeMenu.ts` | **DEAD.** That code is only reached from "Analyze Menu". The crashing tap never touches it |
| The simulator can't reproduce it ⇒ device is the difference | **DEAD.** A Debug build on the physical iPhone ran the identical flow clean, 48 dishes |
| `results.tsx` ruled out because "the crash precedes the server call, so results never render" | **Faulty reasoning** (`router.push("/results")` fires *before* `extractMenu`, so it does render pre-network). Moot now — the crash is earlier still |

**What survived:** it is a JavaScript error (`RCTFatal`), it is pre-network, and it is not a build
mismatch. See below.

---

## What is ESTABLISHED (evidence, not inference)

### 1. It is a JavaScript error, not a native module bug
Crash report's Last Exception Backtrace:

```
RCTExceptionsManager reportFatal:  →  RCTFatal  →  objc_exception_throw  →  abort (SIGABRT)
```

`RCTFatal` is React Native's handler for an **unhandled JS error**. In a Debug build the same
error draws a red screen; in Release it aborts the process.

### 2. It happens BEFORE any server call
`public.scan_log` gets a row for **every** edge-function outcome, errors included. Re-verified
this session: **no row at the crash timestamp**, rows present for every surrounding scan.

### 3. It is a RENDER crash on the Review screen
Santiago confirmed the tap was the bottom-right **thumbnail** (`ThumbStack`), whose only action is
`router.push("/review")`. So the failure is in **drawing the Review screen** — `src/app/review.tsx`
and `src/components/review/PhotoThumb.tsx` — not in reading, compressing or uploading the photo.

### 4. Two further facts from the crash file the first writeup missed
- **The app lived 9.8 seconds** (launch 19:55:20.9 → crash 19:55:30.7). Independently confirms no
  OCR wait happened, without relying on `scan_log`.
- **Thread 6 (JS) was inside `String.split` in `Runtime::drainJobs`** — a promise microtask. That
  `split` is React Native's own `parseErrorStack` chopping up the stack as it reports the error, so
  it tells you the error arrived through an async continuation, not that a `split` was to blame.
  (`src/` contains only two `.split()` calls, both on short strings.)

### 5. It is NOT a build mismatch
Builds 3 and 4 differ only by `.gitignore`/`.easignore`.

---

## Reproduction attempts — ALL of them (2026-08-05)

| Build | Where | Result |
|---|---|---|
| TestFlight Release build 3 | iPhone, 19:55 | **CRASHED** |
| TestFlight Release build 3 | iPhone, 20:04 + 20:07 | Worked — 26 dishes, then Nikkori 48 dishes |
| Debug, built locally | iPhone | Worked — Nikkori 48 dishes |
| Release, built locally | iPhone | Worked |
| Debug | simulator | Worked |

**One crash in six-plus runs. Do not plan around reproducing it on demand — that is what burned
this session.**

---

## THE INSTRUMENTATION (new this session — use it)

`src/lib/crashReporter.ts`, installed at the top of `src/app/_layout.tsx`. On any uncaught JS
error it writes a row to `public.scan_log` with `outcome = 'client_error'` and a `detail` JSONB
holding **message, stack, name, is_fatal, app_version, native_build, debug_build** — then calls
RN's original handler so the crash still happens exactly as before. Nothing is swallowed.

Read them with:

```sql
select id, created_at, detail from public.scan_log
where outcome = 'client_error' order by id desc;
```

**Verified end-to-end** (eval 140): a deliberate uncaught error produced a row carrying its message
and stack, and the redbox still appeared. The RLS policy
`scan_log_insert_client_error` (migration `supabase/migrations/20260805_scan_log_client_error_insert.sql`)
permits INSERT of `client_error` rows only — the public anon key cannot forge extraction results
and still cannot read the table.

⚠ **Two probe rows are already in that table** (`scan_id = 'policy-probe'` and the row whose message
is `crash-reporter self-test`). They are this session's verification artifacts, not real crashes —
the MCP connection is read-only so they could not be deleted.

⚠ **Known gap:** the report is a single insert raced against a 3s timeout. **A crash while offline
is lost.** Add persistence only if a real crash is ever missed that way.

---

## THE NEXT STEP

**Ship a TestFlight build containing the crash reporter, then use the app normally — including the
restaurant field test.** The next crash writes its own diagnosis. Do NOT change client code before
that row exists: there is no measurement of the actual error yet, and this project's rules are
explicit that a predicted cause is a hypothesis until measured.

If you want to hunt it cold in the meantime, the haystack is small and bounded:
`src/app/review.tsx`, `src/components/review/PhotoThumb.tsx`, and what feeds them
(`src/store/scan.store.ts`, the `ScanPhoto` that `GalleryButton` builds from an `ImagePicker`
asset). Note `nativewind@5.0.0-preview.4` is a **preview** release and React Compiler is enabled —
both are Debug/Release-sensitive in principle, neither is evidence.

---

## Gotchas that will waste your time if you don't know them

**1. `xattr -cr node_modules/expo-modules-jsi` before any local iOS build.** The repo lives on
`~/Desktop` with iCloud syncing ON; iCloud stamps `com.apple.FinderInfo` on build artifacts and
`codesign` refuses them:

```
ExpoModulesJSI.framework: resource fork, Finder information, or similar detritus not allowed
```

The `hermes/hermes.h` lines above it are an `in file included from` note trail, not the error.
**Read the LAST line of the failure block.** Still required — it was live again this session.

**2. Metro's port is compiled in (8081).** `--port N` moves the server, not the app. If another
project holds 8081 the app reports `No script URL provided … (null)`, which means "found something
that isn't Metro", not "Metro is down". A stale Metro from a previous session was holding it this
session. The Mac's IP is also **baked at build time**, so you must rebuild after changing networks.

**3. The simulator has no camera** and its library holds whatever you drag in.

**4. Verifying the phone can reach the Mac, without touching the phone:** `ping iPhone-<name>.local`
from the Mac. A sub-millisecond reply means client isolation is off. (2026-08-05: 0.7 ms on the
home network — the public-network isolation that blocked the previous session is gone.)

**5. Capturing a Release build's output over the cable — no Metro, no red screen needed:**

```bash
xcrun devicectl device process launch --console --terminate-existing \
  --device "iPhone de Brad Pitt" com.santiagdc.menu-scan-app
```

This streams the app's stdout/stderr, which is where the `*** Terminating app due to uncaught
exception …` line goes. It attaches to **one** launch — if the user reopens the app from the home
screen you are no longer capturing. Wrap it in a relaunch loop if you need repeated cold starts.

---

## What is NOT implicated

Extraction, the edge function, rotation, and the oracle/gate layer — all independently verified on
2026-08-04 (3 device scans, 15/15 dims, zero inventions; offline gates 50/50 · 50/50; suite 272
passed / 1 pre-existing). **Do not go looking in the pipeline.** The crash is client-side,
pre-network, and now known to be a Review-screen render.

## Artifacts

- Crash report + feedback: `~/Downloads/testflight_feedback/` (`crashlog.crash`, `feedback.json`)
- The JS error message is **not** in the crash file — TestFlight's copy carries no
  *Application Specific Information* section. The raw `.ips` still on the device
  (Xcode → Window → Devices and Simulators → View Device Logs) may carry it; **unchecked.**
- Scan + crash history: `select * from public.scan_log order by id desc;`
