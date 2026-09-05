// §5 of docs/backend-changes-required.md. Before this, a scan failure put the
// raw edge-function error on screen in red with no way forward — literally
// "Check EXPO_PUBLIC_SUPABASE_URL, project status, and network reachability"
// in front of someone holding a menu in a restaurant.
//
// The split: a machine-readable CODE travels with the failure, and the copy
// plus the action live here. The developer-facing string is kept too, but only
// for logs — it never reaches a screen.
//
// ⚠️ NO IMPORTS, DELIBERATELY — same reason as scanOutcome.ts: Deno can load
// it, so the copy table is covered by the suite the repo actually runs. The
// `instanceof FunctionsFetchError` classification stays in analyzeMenu.ts,
// where supabase-js is already a dependency.

export type ScanErrorCode =
  /** The request never reached the server. */
  | "offline"
  /** Reached the server; it failed or relayed a failure. */
  | "server"
  /** The model or the function took too long. */
  | "timeout"
  /** A response came back that we cannot read. */
  | "malformed"
  | "unknown";

/** What the button under the message should do. */
export type ScanErrorAction =
  /** Same photos, run it again. */
  | "retry"
  /** The photos are the problem — go back to the camera. */
  | "rescan"
  /** Nothing to be done here. */
  | "home";

export interface ScanErrorCopy {
  message: string;
  action: ScanErrorAction;
}

// Written for a diner, not a developer: no provider name, no function name,
// no environment variable, no HTTP status, no SCREAMING_CASE. Each one says
// what happened and what the user can do — never what our infrastructure is.
export const SCAN_ERROR_COPY: Record<ScanErrorCode, ScanErrorCopy> = {
  offline: {
    message: "We couldn't connect. Check your signal and try again.",
    action: "retry",
  },
  timeout: {
    message: "That took longer than it should have. Try again.",
    action: "retry",
  },
  server: {
    message: "Something went wrong on our end. Try again in a moment.",
    action: "retry",
  },
  malformed: {
    message: "We couldn't read the result. Try scanning the menu again.",
    action: "rescan",
  },
  unknown: {
    message: "Something went wrong. Try again.",
    action: "retry",
  },
};

/** Last-resort classification from a message, for a plain `Error` that carries
 *  no class we recognise. Only "timed out" is worth pattern-matching — it is
 *  the one string our own code raises on purpose (MODEL_TIMEOUT_MS). Everything
 *  else is honestly unknown; guessing harder would mean matching on vendor
 *  wording, which changes without notice. */
export function codeFromMessage(message: string): ScanErrorCode {
  return /timed out|timeout/i.test(message) ? "timeout" : "unknown";
}

/** The copy to render. Falls back to "unknown" for a null or unrecognised
 *  code, so a failure can never render an empty message. */
export function scanErrorCopy(code: ScanErrorCode | null): ScanErrorCopy {
  return (code && SCAN_ERROR_COPY[code]) || SCAN_ERROR_COPY.unknown;
}
