import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  codeFromMessage,
  SCAN_ERROR_COPY,
  scanErrorCopy,
} from "../src/lib/scanError.ts";
import type { ScanErrorCode } from "../src/lib/scanError.ts";

// §5's promise is not "nicer wording" — it is that no environment variable,
// function name, provider name or HTTP status can reach a diner's screen.
// That is a property of the whole table, so it is tested as one.

Deno.test("SCAN_ERROR_COPY: no developer vocabulary reaches a user, in any entry", () => {
  // The exact string that shipped to users before this change:
  //   "Check EXPO_PUBLIC_SUPABASE_URL, project status, and network reachability."
  const banned = [
    /[A-Z][A-Z0-9_]{3,}/, // SCREAMING_CASE identifiers, case-SENSITIVE
    /supabase|mistral|openai|gpt|edge function|http|url|api/i,
    /\bnull\b|\bundefined\b|\berror code\b|\bstatus\b/i,
  ];
  for (const [code, copy] of Object.entries(SCAN_ERROR_COPY)) {
    for (const pattern of banned) {
      assertEquals(
        pattern.test(copy.message),
        false,
        `${code} leaks developer vocabulary via ${pattern}: "${copy.message}"`,
      );
    }
  }
});

Deno.test("SCAN_ERROR_COPY: every entry says what happened AND offers an action", () => {
  for (const [code, copy] of Object.entries(SCAN_ERROR_COPY)) {
    assertEquals(copy.message.length > 0, true, `${code} has no message`);
    // A dead end is a real option, but it has to be chosen, not defaulted to.
    assertEquals(
      ["retry", "rescan", "home"].includes(copy.action),
      true,
      `${code} has no valid action`,
    );
  }
});

Deno.test("scanErrorCopy: a null or unrecognised code still renders a message", () => {
  // A failure must never render an empty string, which is what a missing
  // error_code from an older function deploy would otherwise produce.
  assertEquals(scanErrorCopy(null), SCAN_ERROR_COPY.unknown);
  assertEquals(
    scanErrorCopy("not-a-code" as ScanErrorCode),
    SCAN_ERROR_COPY.unknown,
  );
});

Deno.test("scanErrorCopy: the photos being the problem is the only rescan", () => {
  // retry re-runs the same photos; rescan sends the user back to the camera.
  // Offering rescan for a network blip would make the user retake good photos.
  assertEquals(scanErrorCopy("offline").action, "retry");
  assertEquals(scanErrorCopy("timeout").action, "retry");
  assertEquals(scanErrorCopy("server").action, "retry");
  assertEquals(scanErrorCopy("malformed").action, "rescan");
});

Deno.test("codeFromMessage: recognises our own timeout string, guesses nothing else", () => {
  // MODEL_TIMEOUT_MS raises "Model request timed out after 120s".
  assertEquals(codeFromMessage("Model request timed out after 120s"), "timeout");
  assertEquals(codeFromMessage("Request Timeout"), "timeout");
  // Deliberately NOT pattern-matched: vendor wording changes without notice,
  // so anything else is honestly unknown rather than confidently wrong.
  assertEquals(codeFromMessage("socket hang up"), "unknown");
  assertEquals(codeFromMessage("502 Bad Gateway"), "unknown");
  assertEquals(codeFromMessage(""), "unknown");
});
