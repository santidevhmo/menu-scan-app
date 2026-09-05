import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  pagesToRescan,
  scanOutcome,
  unreadablePagesMessage,
} from "../src/lib/scanOutcome.ts";
import type { PageOutcomeLiteral } from "../src/lib/scanOutcome.ts";

// Lives in scripts/ rather than src/lib/__tests__/ for one reason: this is the
// directory `deno test --allow-all --env-file=.env.local scripts/ supabase/`
// already covers, so the logic is tested by the command the repo actually
// runs. The two files under src/lib/__tests__/ do not execute at all today.

const p = (outcome: PageOutcomeLiteral, page = 1) => ({ page, outcome });

Deno.test("scanOutcome: no verdicts falls back to the item count", () => {
  // The dense-crop path returns no per-page judgement. Empty must NOT be read
  // as "every page was fine".
  assertEquals(scanOutcome([], 12), "ok");
  assertEquals(scanOutcome([], 0), "unusable");
});

Deno.test("scanOutcome: every page unreadable is unusable", () => {
  assertEquals(scanOutcome([p("unreadable", 1)], 0), "unusable");
  assertEquals(
    scanOutcome([p("unreadable", 1), p("unreadable", 2)], 0),
    "unusable",
  );
});

Deno.test("scanOutcome: one bad page among good ones is partial", () => {
  assertEquals(
    scanOutcome([p("ok", 1), p("unreadable", 2), p("ok", 3)], 18),
    "partial",
  );
});

Deno.test("scanOutcome: an unreadable page with ZERO items is partial, not unusable", () => {
  // The regression this pins: if the zero-item rung ran first, we would tell
  // the user the menu has no dishes when the truth is we could not read the
  // page that held them. A re-scan is the correct offer.
  assertEquals(scanOutcome([p("ok", 1), p("unreadable", 2)], 0), "partial");
});

Deno.test("scanOutcome: readable everywhere but nothing found is unusable, not partial", () => {
  // A wine-list cover. Re-scanning a page we read correctly changes nothing,
  // so this must not offer a re-scan.
  assertEquals(
    scanOutcome([p("readable_no_items", 1), p("readable_no_items", 2)], 0),
    "unusable",
  );
});

Deno.test("scanOutcome: readable_no_items alongside a good page is ok", () => {
  assertEquals(scanOutcome([p("ok", 1), p("readable_no_items", 2)], 9), "ok");
});

Deno.test("pagesToRescan: names the bad pages in order, 1-based", () => {
  const pages = [p("unreadable", 3), p("ok", 1), p("unreadable", 2)];
  assertEquals(pagesToRescan(pages, 5), [2, 3]);
});

Deno.test("pagesToRescan: empty unless the scan is partial", () => {
  // ok -> nothing to re-scan; unusable -> nothing worth keeping.
  assertEquals(pagesToRescan([p("ok", 1)], 5), []);
  assertEquals(pagesToRescan([p("unreadable", 1)], 0), []);
  assertEquals(pagesToRescan([], 0), []);
});

Deno.test("unreadablePagesMessage: names the pages, never a cause", () => {
  assertEquals(unreadablePagesMessage([]), "");

  const one = unreadablePagesMessage([2]);
  assertEquals(
    one,
    "Page 2: we couldn't make out any text on it. Your goals are saved — a new photo is all we need.",
  );

  assertEquals(
    unreadablePagesMessage([2, 4]),
    "Pages 2 and 4: we couldn't make out any text on them. Your goals are saved — a new photo is all we need.",
  );
  assertEquals(
    unreadablePagesMessage([1, 3, 7]),
    "Pages 1, 3 and 7: we couldn't make out any text on them. Your goals are saved — a new photo is all we need.",
  );

  // The one thing this copy may never do: name a cause we cannot detect.
  for (const pages of [[2], [2, 4], [1, 3, 7]]) {
    const text = unreadablePagesMessage(pages).toLowerCase();
    for (const cause of ["blur", "dark", "glare", "shak", "focus", "light"]) {
      assertEquals(text.includes(cause), false, `named a cause: ${cause}`);
    }
  }
});
