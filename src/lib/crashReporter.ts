import type { ErrorUtils as RNErrorUtils } from "react-native";
import Constants from "expo-constants";

/** How long to wait for the report before letting the app die anyway. */
const REPORT_TIMEOUT_MS = 3000;

/** Reports uncaught JS errors to scan_log before React Native kills the app.
 *
 *  iOS crash reports name only `RCTFatal` — never the JavaScript error behind
 *  it. The 2026-08-05 TestFlight crash cost three sessions for exactly that
 *  reason, so the app now says what killed it on its way down.
 *
 *  The original handler runs LAST and only once the insert settles: it aborts
 *  the process, so anything reported after it never leaves the phone. That
 *  briefly delays the crash — it does not prevent or hide it. */
export function installCrashReporter() {
  const errorUtils = (globalThis as unknown as { ErrorUtils?: RNErrorUtils })
    .ErrorUtils;
  if (!errorUtils) return;

  const original = errorUtils.getGlobalHandler();
  let reporting = false;

  errorUtils.setGlobalHandler((error, isFatal) => {
    // A throw inside this handler would re-enter it forever.
    if (reporting) {
      original(error, isFatal);
      return;
    }
    reporting = true;

    const report = (async () => {
      // Imported lazily and ONLY on the crash path. `supabase.ts` throws at
      // module scope when its env vars are missing — which is the very defect
      // this file was written after (eval 141: the shipped bundle had no
      // credentials) — so an eager import would drag that throw onto app
      // LAUNCH and produce a crash that cannot report its own cause.
      const { supabase } = await import("./supabase");
      await supabase.from("scan_log").insert({
        scan_id: `err-${Date.now().toString(36)}`,
        pages: 0,
        outcome: "client_error",
        detail: {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? (error.stack ?? null) : null,
          is_fatal: isFatal === true,
          // Which build produced this. TestFlight, local Debug and local
          // Release builds all report here; without this a row is ambiguous.
          app_version: Constants.expoConfig?.version ?? null,
          native_build: Constants.nativeBuildVersion ?? null,
          debug_build: __DEV__,
        },
      });
    })().then(
      () => undefined,
      // Swallowed deliberately: a failed report must never replace the real
      // error, and an unhandled rejection here would re-enter this handler.
      () => undefined,
    );

    // ponytail: plain timeout race, no retry queue — a crash while offline is
    // lost. Add persistence only if a real crash is ever missed this way.
    Promise.race([
      report,
      new Promise((resolve) => setTimeout(resolve, REPORT_TIMEOUT_MS)),
    ]).then(() => {
      reporting = false;
      original(error, isFatal);
    });
  });
}
