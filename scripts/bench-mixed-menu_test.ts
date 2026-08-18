// $0, no model calls. The mixed-menu harness is only a valid comparison against
// bench-macros.ts while the scored dishes' TEXT is identical in both — otherwise
// a re-extraction that reworded one description turns a batch-composition result
// into a prompt-text result, silently.
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertFixtureTextMatches, fixtureBatches, MENU_ARCHIVE } from "./bench-mixed-menu.ts";
import { ENRICH_BATCH_SIZE } from "../supabase/functions/analyze-menu/enrich.ts";
import { itemsFromArchive } from "./bench-pipeline.ts";
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";

// Through bench-macros' own loader, so the test and the harness agree on what a
// valid oracle is.
const entries = loadOracle(ORACLE_PATH);

Deno.test("every weighted fixture's menu has an archived extraction", () => {
  for (const entry of entries) {
    if (!MENU_ARCHIVE[entry.menu]) {
      throw new Error(`no archived extraction mapped for menu "${entry.menu}"`);
    }
  }
});

Deno.test("every fixture is present in its own menu with the oracle's exact text", () => {
  const menus = [...new Set(entries.map((e) => e.menu))];
  for (const menu of menus) {
    const items = itemsFromArchive(
      Deno.readTextFileSync(`scripts/fixtures/caches/${MENU_ARCHIVE[menu]}`),
    );
    // Throws with the offending dish and both texts if anything drifts.
    assertFixtureTextMatches(menu, items, entries);
  }
});

Deno.test("a reworded description is caught rather than scored", () => {
  const menu = entries[0].menu;
  const items = itemsFromArchive(
    Deno.readTextFileSync(`scripts/fixtures/caches/${MENU_ARCHIVE[menu]}`),
  );
  const tampered = items.map((i) =>
    i.name === entries.find((e) => e.menu === menu)!.name
      ? { ...i, description: `${i.description} con trufa` }
      : i
  );
  assertThrows(
    () => assertFixtureTextMatches(menu, tampered, entries),
    Error,
    "differs from the oracle's",
  );
});

Deno.test("a missing fixture is caught rather than silently unscored", () => {
  const menu = entries[0].menu;
  const name = entries.find((e) => e.menu === menu)!.name;
  const items = itemsFromArchive(
    Deno.readTextFileSync(`scripts/fixtures/caches/${MENU_ARCHIVE[menu]}`),
  ).filter((i) => i.name !== name);
  assertThrows(() => assertFixtureTextMatches(menu, items, entries), Error, "is not in");
});

Deno.test("the fixtures really are spread across several menus", () => {
  // The whole point is that a dish rides with its own menu's items. If every
  // fixture collapsed onto one menu this harness would be measuring one batch.
  const menus = new Set(entries.map((e) => e.menu));
  assertEquals(menus.size >= 4, true, `expected 4+ menus, got ${menus.size}`);
});

// The cost optimisation is only sound if the batches it keeps are IDENTICAL to
// the ones production would build. If fixtureBatches ever regrouped items, every
// focused run would silently measure a batch composition that never occurs.
Deno.test("fixtureBatches preserves production's exact chunk boundaries", () => {
  for (const menu of [...new Set(entries.map((e) => e.menu))]) {
    const whole = itemsFromArchive(
      Deno.readTextFileSync(`scripts/fixtures/caches/${MENU_ARCHIVE[menu]}`),
    );
    const names = entries.filter((e) => e.menu === menu).map((e) => e.name);
    const kept = fixtureBatches(whole, names);

    // every scored dish survives the trim
    for (const name of names) {
      assertEquals(kept.some((i) => i.name === name), true, `${menu}: dropped ${name}`);
    }
    // and each kept run of 10 is a verbatim slice of the whole menu, in order
    for (const name of names) {
      const wholeIdx = whole.findIndex((i) => i.name === name);
      const b = Math.floor(wholeIdx / ENRICH_BATCH_SIZE);
      const expected = whole.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE);
      const at = kept.findIndex((i) => i.name === expected[0].name);
      assertEquals(
        kept.slice(at, at + expected.length).map((i) => i.name),
        expected.map((i) => i.name),
        `${menu}: ${name}'s batch was regrouped`,
      );
    }
  }
});

Deno.test("fixtureBatches refuses a fixture it cannot locate", () => {
  const menu = entries[0].menu;
  const whole = itemsFromArchive(
    Deno.readTextFileSync(`scripts/fixtures/caches/${MENU_ARCHIVE[menu]}`),
  );
  assertThrows(() => fixtureBatches(whole, ["NOT ON THIS MENU"]), Error, "cannot locate its batch");
});
