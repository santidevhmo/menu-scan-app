// The scan-level state, DERIVED from the per-page verdicts. The server never
// sends it — see docs/backend-changes-required.md §1. One menu, 1–10 pages
// (/CONTEXT.md → Scan, Page), and three destinations because the UX branches
// three ways: proceed, offer a per-page re-scan, or dead-end.
//
// ⚠️ NO IMPORTS, DELIBERATELY. The parameter shape is declared structurally
// rather than imported from @/types/scan so that BOTH runners can load this
// file: Metro resolves the `@` alias and extensionless paths, Deno resolves
// neither. That buys the one thing that matters here — this logic is covered
// by `deno test --allow-all --env-file=.env.local scripts/ supabase/`, the
// command the repo actually runs. The two hand-rolled tests under
// `src/lib/__tests__/` do not run at all today (Node 25 rejects their
// extensionless `.ts` imports with ERR_MODULE_NOT_FOUND); that breakage is
// pre-existing and is NOT fixed here.
//
// The cost of the no-imports rule is that the two string unions below are
// spelled twice, here and in src/types/scan.ts. Two literal unions is a
// cheaper price than untested branching logic.

export type PageOutcomeLiteral = "ok" | "unreadable" | "readable_no_items";
export type ScanOutcomeLiteral = "ok" | "partial" | "unusable";

/** What the whole scan amounts to.
 *
 *  Order is load-bearing and each rung is here for a reason:
 *
 *  1. **No verdicts at all** — the dense-crop path makes no per-page
 *     judgement, so there is nothing to offer a per-page re-scan against.
 *     Fall back to the only signal there is: did we find anything?
 *  2. **Every page unreadable** — nothing to show and nothing to salvage.
 *  3. **Some page unreadable** → `partial`, *even with zero items*. A page we
 *     could not read might have held every dish on the menu, so a re-scan is
 *     exactly the right offer. This rung must sit ABOVE the zero-item rung or
 *     an unreadable page would be reported as an empty menu — telling the user
 *     the restaurant has no dishes when in fact we could not read the page.
 *  4. **Readable everywhere but nothing found** — a wine-list cover, a page of
 *     prose. A re-scan of a page we read correctly would change nothing, so
 *     this is a genuine dead end and must not offer one.
 */
export function scanOutcome(
  pages: readonly { outcome: PageOutcomeLiteral }[],
  itemCount: number,
): ScanOutcomeLiteral {
  if (pages.length === 0) return itemCount > 0 ? "ok" : "unusable";

  const unreadable = pages.filter((p) => p.outcome === "unreadable").length;
  if (unreadable === pages.length) return "unusable";
  if (unreadable > 0) return "partial";
  return itemCount > 0 ? "ok" : "unusable";
}

/** The 1-based page numbers a user should be asked to re-scan, in page order.
 *  Empty unless `scanOutcome` is "partial" — an unusable scan offers no
 *  re-scan (there is nothing to keep) and an ok scan needs none. */
export function pagesToRescan(
  pages: readonly { page: number; outcome: PageOutcomeLiteral }[],
  itemCount: number,
): number[] {
  if (scanOutcome(pages, itemCount) !== "partial") return [];
  return pages
    .filter((p) => p.outcome === "unreadable")
    .map((p) => p.page)
    .sort((a, b) => a - b);
}
