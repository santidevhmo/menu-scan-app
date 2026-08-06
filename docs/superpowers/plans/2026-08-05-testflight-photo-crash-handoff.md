# HANDOFF — TestFlight crash when submitting a photo (OPEN)

**Status: OPEN.** Reproduces reliably on Santiago's physical iPhone (TestFlight Release build).
Does NOT reproduce in the iOS simulator. Written 2026-08-05 so the next session starts from a
diagnosis instead of from zero.

---

## The symptom

On the **physical iPhone**, TestFlight build 3 (v1.0.0, commit `bd124d6`):
pick a photo from the library → tap the bottom-right submit button → **the app dies instantly.**
Santiago's own note on the report: *"Nikkori menu crash"*.

In the **iOS simulator** (Debug, same source): the identical flow completes normally, all the way
through extraction to results. **The simulator cannot reproduce this.**

---

## What is ESTABLISHED (evidence, not inference)

### 1. It is a JavaScript error, not a native module bug
The crash report's Last Exception Backtrace:

```
RCTExceptionsManager reportFatal:  →  RCTFatal  →  objc_exception_throw  →  abort (SIGABRT)
```

`RCTFatal` is React Native's handler for an **unhandled JS error**. This is the single most
important fact in this document, because it explains the simulator gap:

| build | same JS error causes |
|---|---|
| **Debug** (simulator, `expo run:ios`) | a red error screen; app keeps running |
| **Release** (TestFlight, `--profile production`) | **process abort** |

So a Debug build will SHOW this error rather than crash on it.

### 2. It happens BEFORE any server call
The edge function writes a `public.scan_log` row for **every** outcome — success, `needs_rotation`,
`needs_crops`, and errors. Querying around the crash:

| time (UTC) | event | scan_log row |
|---|---|---|
| 2026-08-06 02:55:43 | the crash (per `feedback.json`) | **none** |
| 2026-08-06 03:04:57 | a later scan, 26 items | present |

**No row at crash time ⇒ the app died before the request reached the server.** The defect is in the
CLIENT photo-handling path (`src/lib/analyzeMenu.ts` `extractMenu`, `src/lib/compressImage.ts`, the
gallery/review screens), not in extraction, not in the edge function.

### 3. It is NOT a build mismatch
TestFlight build 3 = commit `bd124d6`; the simulator ran `1ff9686`. Those two commits differ by
**`.gitignore` and `.easignore` only** — 0 files under `src/`, `app.json`, `package.json`, `assets/`.
Same app code. The differences that remain are **Debug vs Release** and **simulator vs real device**.

---

## Leading hypothesis (UNVERIFIED — do not fix before confirming)

**Real camera photos are HEIC; the simulator's library held PNGs I dragged in.**

`src/lib/analyzeMenu.ts` picks the upload mime type from the file extension:

```ts
const ext = src.uri.split(".").pop()?.toLowerCase();
const mime = ext === "png" ? "image/png" : "image/jpeg";
```

A `.heic` file is therefore labelled `image/jpeg`. Real camera photos also carry EXIF orientation
that gallery PNGs do not.

**Why this is only a hypothesis:** a wrong mime type would most likely produce a SERVER-side
rejection — and that would have written a `scan_log` error row, which did not happen. So either the
throw happens earlier (during `getInfoAsync` / `compressImage` / `readAsStringAsync`), or the mime
issue is a red herring. **Confirm before changing code.** Note this project's own rule: a predicted
cause is a hypothesis until measured.

---

## THE NEXT STEP (cheap, decisive) — ⚠ REQUIRES A PRIVATE NETWORK

**Install a Debug build on the physical iPhone over USB and reproduce with a real camera photo.**
Debug turns the fatal abort into a red screen naming the exact error and `file:line`.

**This was ATTEMPTED on 2026-08-05 and blocked by the network, not by anything technical.** The
build succeeded and installed, but the app showed `No script URL provided … (null)`: a Debug build
fetches its JavaScript from Metro on the Mac over WiFi, and Santiago was on a **public network with
client isolation** (Mac `172.16.17.48`, router `172.16.16.1`). Verified from the Mac side —
Metro bound to `*:8081`, firewall off, baked `ip.txt` matching the live IP — and then confirmed from
the phone: Safari could not open `http://172.16.17.48:8081/status`. Phone→laptop traffic was blocked
by the access point. **Nothing was wrong with the app or the build.**

**So: do this from a private network** (home WiFi, or the Mac joined to the phone's Personal Hotspot —
hotspots never isolate clients). Then:

```bash
xattr -cr node_modules/expo-modules-jsi          # see the gotcha below — required
pnpm ios --device "iPhone de Brad Pitt"          # re-bakes the current IP; must rebuild after a network change
```

Sanity check BEFORE touching the app: open `http://<mac-ip>:8081/status` in Safari **on the phone**.
It must return `packager-status:running`. If it doesn't, fix the network first — every other symptom
downstream is a red herring.

Then on the phone: pick a **real camera photo** (not an imported PNG) and submit. Capture the red
screen text verbatim. That should reduce this to a one-line fix.

If the red screen does NOT appear in Debug on the device, the next discriminator is Debug-vs-Release
rather than simulator-vs-device; build Release locally with
`pnpm ios --device "iPhone de Brad Pitt" --configuration Release` and reproduce there.

---

## Gotchas that will waste your time if you don't know them

**1. `xattr -cr node_modules/expo-modules-jsi` before any local iOS build.**
The repo lives on `~/Desktop`, which has **iCloud Desktop & Documents syncing ON**. iCloud stamps
build artifacts with `com.apple.FinderInfo`, and `codesign` refuses to sign a bundle carrying it.
The build fails with:

```
ExpoModulesJSI.framework: resource fork, Finder information, or similar detritus not allowed
❌ Script '[CP-User] Build ExpoModulesJSI xcframework' failed
```

This is NOT a missing-header problem — the `hermes/hermes.h` lines above it in the log are an
`in file included from` note trail, not the error. **A previous session misread exactly that and
wrongly concluded the simulator was unusable.** Read the LAST line of the failure block. Permanent
fix: move the repo off the iCloud-synced Desktop.

**2. Metro's port is compiled in.** `expo run:ios --port N` moves the SERVER but not the app, which
is hardwired to 8081 (`RCTDefines.h`). If another project holds 8081, the app asks it "are you
Metro?", gets HTML, and reports `No script URL provided … (null)` — which reads like Metro is down
but means "found something that isn't Metro". Free 8081 rather than moving the port.

**3. The simulator is not a substitute here.** It has no camera and its photo library holds whatever
you drag in. For anything involving real photos — HEIC, EXIF, size, orientation — it will pass while
the device fails.

---

## Where to look first in the code

- `src/lib/analyzeMenu.ts` — `extractMenu`: `getInfoAsync` → passthrough-or-compress → base64 →
  mime guess → invoke. **Everything before the `supabase.functions.invoke` call is in scope.**
- `src/lib/compressImage.ts` — `compressImage`, `rotateImage`, `prepareTile`.
- `src/components/scan/GalleryButton.tsx`, `src/app/review.tsx` — the pick-and-submit path.
- ⚠️ `src/app/results.tsx` gained 139 lines in the 2026-08-04 allergen merge. Ruled less likely
  (the crash precedes the server call, so results never render) but worth a look if the above is clean.

## What is NOT implicated

Extraction, the edge function, rotation, and the oracle/gate layer are all fine and independently
verified on 2026-08-04: 3 device scans scored 15/15 dims with zero invented dishes, and the offline
gates sit at 50/50 · 50/50 with the suite at 272 passed / 1 pre-existing. **Do not go looking in the
pipeline.** The crash is client-side and pre-network.

## Artifacts

- Crash report + feedback: `~/Downloads/testflight_feedback/` (`crashlog.crash`, `feedback.json`)
- The JS error message is **not** in the crash file — it must be captured from a Debug run.
- Live scan history readable via the Supabase MCP:
  `select * from public.scan_log order by id desc;`
