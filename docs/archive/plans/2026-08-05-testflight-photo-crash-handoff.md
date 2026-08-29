# SOLVED — TestFlight crash on opening the Review screen

**Status: ROOT CAUSE FOUND AND PROVEN (2026-08-05, eval 141).**
**The TestFlight build shipped without the Supabase credentials.** `src/lib/supabase.ts` throws at
module scope when they are missing, and the Review screen is the first route that loads it — so
tapping the bottom-right photo thumbnail killed the app, every time, on TestFlight only.

Earlier versions of this document proposed HEIC photo formats, EXIF orientation, Debug-vs-Release
and simulator-vs-device. **All of those were wrong.** Keep reading only if you want the evidence or
the lessons; the fix is at the top.

---

## The proof

I pulled the JS bundle out of the actual `.ipa` Santiago installed (build 3,
`19ee091f-a2d1-4b12-99e0-c8f892a951ec`) and compared it against the locally-built Release bundle
that works:

| String in `main.jsbundle` | TestFlight build 3 (**crashed**) | Local Release (**worked**) |
|---|---|---|
| project ref `uonuiadueykynbetxxrw` | **0** | 1 |
| anon key prefix `eyJhbGciOi` | **0** | 1 |
| `"Missing Supabase env vars"` | **1** | **0** |

That last row is self-confirming rather than incidental. The minifier constant-folds the guard:
with real credentials inlined, `if (!supabaseUrl || !supabaseAnonKey)` becomes `if (false)` and the
throw is **stripped** — hence 0 in the working bundle. With them `undefined` it becomes `if (true)`
and the throw is **all that survives** — hence 1 in the crashing bundle, alongside no credentials.

**The shipped app contained the error message and not the credentials.**

## Why it only ever hit TestFlight

`.env` is gitignored *and* listed in `.easignore`, so it is never uploaded to EAS. The supported
replacement is EAS environment variables — and `eas env:list` returned **no variables in any
environment**, with no legacy secrets either. Every build that worked (simulator, local Debug,
local Release) bundles `.env` straight off the Mac. Only the EAS build lacked it.

## Why the thumbnail, and not launch

Nothing on the launch or camera path imports `supabase`. `review.tsx` is the first route that does
(`review.tsx` → `@/lib/analyzeMenu` → `./supabase`). Route modules are required lazily, so the app
started fine, the camera worked, the gallery worked, and the module was evaluated — and threw —
the instant Review was opened. An uncaught error at module scope is fatal in Release: `RCTFatal`.

This is why `scan_log` had no row: the throw happens before any network call can be made.
It also explains the 9.8-second lifetime and the `drainJobs` (promise microtask) frame in the
crash report — lazy route loading resolves through a promise.

---

## The fix (applied)

1. **`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` created as EAS environment
   variables** in `production`, `preview` and `development`, visibility `plaintext` (correct for
   `EXPO_PUBLIC_*` — they are compiled into the client bundle and are not secrets).
2. **`src/lib/crashReporter.ts`** reports any uncaught JS error to `scan_log` before RN kills the
   app, so this class of failure can never again be invisible. It imports `supabase` **lazily, on
   the crash path only** — an eager import would drag `supabase.ts`'s module-scope throw onto app
   launch and produce a crash that cannot report its own cause.

**Verifying a future build actually carries the credentials** — do this rather than trusting it:

```bash
curl -sL -o b.ipa "<Application Archive URL from `eas build:list`>"
unzip -q b.ipa -d x
strings x/Payload/menuscanapp.app/main.jsbundle | grep -c uonuiadueykynbetxxrw   # must be >= 1
strings x/Payload/menuscanapp.app/main.jsbundle | grep -c "Missing Supabase env" # must be 0
```

---

## Lessons (the expensive ones)

1. **A build artifact is inspectable — inspect it.** Three sessions theorised about a binary that
   was one `curl` and one `unzip` away. The `.ipa` is linked from `eas build:list`.
2. **"Reproduces reliably" is a claim about a COUNT.** Eval 139 saw one crash and wrote "reliably";
   eval 140 then *disproved* it using two `scan_log` rows whose machine was never established — and
   was wrong, because both were simulator runs (eval 139's own ledger records "one simulator scan,
   26 items", which is row id 3). **Both errors are the same error: a claim about frequency with no
   denominator.** Write the count and the machine, or write neither.
3. **When a user's word for a control could name two buttons, show them both and make them pick.**
   "Bottom-right submit button" was read as the upload. It was the thumbnail. That one answer
   killed the HEIC hypothesis instantly — the upload code is unreachable from that tap.
4. **A config check that throws at module scope relocates the crash to whoever imports it first.**
   The failure surfaced three screens away from its cause, which is what made it look photo-related.
5. **Environments that bundle differently will fail differently.** `.easignore` excluding `.env` is
   correct; the bug was having no replacement. Anything read via `process.env` at bundle time must
   exist in *every* place a bundle is built.

---

## Environment traps (still true, still expensive)

**1. `xattr -cr node_modules/expo-modules-jsi` before any local iOS build.** The repo lives on an
iCloud-synced `~/Desktop`; iCloud stamps `com.apple.FinderInfo` on build artifacts and `codesign`
refuses them (`resource fork, Finder information, or similar detritus not allowed`). The
`hermes/hermes.h` lines above it are an `in file included from` note trail — **read the LAST line of
the failure block.**

**2. Metro's port is compiled in (8081).** `No script URL provided … (null)` means "the phone cannot
reach Metro", never "Metro is down". Causes seen: another project holding 8081, a stale Metro from a
previous session, and a public WiFi with client isolation. **The Mac's IP is baked at build time —
rebuild after changing networks.**

**3. Check the phone can reach the Mac without touching the phone:** `ping iPhone-<name>.local`.
Sub-millisecond means no client isolation.

**4. Capturing a Release build's output over the cable** (no Metro, no red screen needed):

```bash
xcrun devicectl device process launch --console --terminate-existing \
  --device "iPhone de Brad Pitt" com.santiagdc.menu-scan-app
```

Attaches to **one** launch — if the user reopens the app from the home screen you are no longer
capturing.

**5. The simulator has no camera** and its library holds whatever you drag in.

---

## Reading crash reports

`select id, created_at, detail from public.scan_log where outcome='client_error' order by id desc;`

⚠ **Five rows in that table are verification artifacts, not real crashes** — `scan_id='policy-probe'`
and four whose message is `crash-reporter self-test` / `lazy-import self-test`. The MCP connection is
read-only so they could not be deleted.

⚠ **Known gap:** the report is one insert raced against a 3s timeout. **A crash while offline is
lost.** Marked `ponytail:` in the source. Add persistence only if a real crash is ever missed.

The RLS policy `scan_log_insert_client_error`
(`supabase/migrations/20260805_scan_log_client_error_insert.sql`) permits INSERT of `client_error`
rows only — probed both ways: a crash row inserts, a forged `outcome='items'` row is rejected, and
anon SELECT still returns empty.

## What was never implicated

Extraction, the edge function, rotation, and the oracle/gate layer. All verified 2026-08-04
(3 device scans, 15/15 dims, zero inventions; offline gates 50/50 · 50/50; suite 272 passed /
1 pre-existing). The pipeline was healthy the whole time.
