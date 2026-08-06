// Cross-source item merge for per-page / per-tile extraction. Moved here from
// src/lib/adaptiveExtraction.ts (2026-07-10): the deployed edge function
// bundles only its own directory, and the per-page recipe now runs server-side.
import type { ExtractedMenuItem } from "./extract.ts";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + Number(a[i - 1] !== b[j - 1]),
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

function duplicate(
  a: ExtractedMenuItem,
  b: ExtractedMenuItem,
  sectionLenient: boolean,
): boolean {
  const left = normalize(a.name);
  const right = normalize(b.name);
  const compatiblePrice = a.price === b.price || a.price === null ||
    b.price === null;
  if (left === right) return compatiblePrice;
  // A null/empty section means "unknown", not "a different section": a crop
  // that omits section_title must still merge with a sectioned near-name copy.
  // sectionLenient (tile merges only): tiles of ONE physical page see
  // different heading context near their edges, so a near-name same-price
  // same-category pair with CONFLICTING sections is the same dish (nikkori
  // "Nikkori/Nikori Dynamite" ROLLOS vs EMPANIZADOS, diagnosed 2026-07-11).
  const aSection = normalize(a.section_title ?? "");
  const bSection = normalize(b.section_title ?? "");
  const compatibleSection = sectionLenient ||
    aSection === bSection || aSection === "" || bSection === "";
  if (
    a.price === null ||
    b.price === null ||
    a.price !== b.price ||
    a.category !== b.category ||
    !compatibleSection
  ) {
    return false;
  }
  return (
    editDistance(left, right) <=
      Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2))
  );
}

function mergeOptions(
  first: ExtractedMenuItem["options"],
  second: ExtractedMenuItem["options"],
): ExtractedMenuItem["options"] {
  return [...first, ...second].filter(
    (option, index, all) =>
      all.findIndex(
        (candidate) =>
          normalize(candidate.name) === normalize(option.name) &&
          candidate.price === option.price,
      ) === index,
  );
}

function richer(a: ExtractedMenuItem, b: ExtractedMenuItem): ExtractedMenuItem {
  const best = b.description.length + b.options.length >
      a.description.length + a.options.length
    ? b
    : a;
  return { ...best, options: mergeOptions(a.options, b.options) };
}

function nearName(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  return (
    editDistance(left, right) <=
      Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2))
  );
}

function twinFoldCandidate(
  a: ExtractedMenuItem,
  b: ExtractedMenuItem,
): boolean {
  const left = normalize(a.name);
  const right = normalize(b.name);
  const eitherSectionUnknown = !a.section_title || !b.section_title;
  const sameSection = a.section_title === b.section_title;
  const exactMultiWordName = left === right && left.includes(" ");
  // Tile twins routinely disagree on section_title (edge crop = different
  // heading context) and drift a letter or two in the name (eval 065:
  // PapaBoneless $192 no-section vs Papaboneless $189 "Crispy Chicken").
  // Same-grams is the guard that keeps real distinct dishes from folding.
  return a.price !== null &&
    b.price !== null &&
    a.price !== b.price &&
    a.grams !== null &&
    b.grams !== null &&
    (eitherSectionUnknown
      ? nearName(a.name, b.name)
      : sameSection
      ? left === right
      : exactMultiWordName) &&
    a.category === b.category &&
    a.grams === b.grams;
}

function normalizedWords(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function wordMatches(a: string, b: string): boolean {
  return a === b || editDistance(a, b) <= 1;
}

function strictWordSubset(
  subsetCandidate: string,
  supersetCandidate: string,
): boolean {
  const small = normalizedWords(subsetCandidate);
  const large = normalizedWords(supersetCandidate);
  if (small.length === 0 || small.length >= large.length) return false;
  return small.every((smallWord) =>
    large.some((largeWord) => wordMatches(smallWord, largeWord))
  );
}

function nullGramsTwinFoldCandidate(
  a: ExtractedMenuItem,
  b: ExtractedMenuItem,
): boolean {
  return a.grams === null &&
    b.grams === null &&
    a.section_title !== null &&
    a.section_title !== "" &&
    a.section_title === b.section_title &&
    a.category === b.category &&
    (normalize(a.name) === normalize(b.name) ||
      strictWordSubset(a.name, b.name) || strictWordSubset(b.name, a.name)) &&
    (a.price !== b.price || a.price === null || b.price === null);
}

export function mergeItemSources(
  sources: ExtractedMenuItem[][],
  sectionLenient = false,
): ExtractedMenuItem[] {
  const sectionTitles = new Set(
    sources
      .flat()
      .flatMap((entry) =>
        entry.section_title ? [normalize(entry.section_title)] : []
      ),
  );
  const sectionCounts = sources.map((source) => {
    const counts = new Map<string | null, number>();
    for (const entry of source) {
      counts.set(
        entry.section_title,
        (counts.get(entry.section_title) ?? 0) + 1,
      );
    }
    return counts;
  });
  const kept: {
    item: ExtractedMenuItem;
    sources: Set<number>;
    primarySource: number;
  }[] = [];

  sources.forEach((source, sourceIndex) => {
    for (const entry of source) {
      if (
        entry.price === null &&
        entry.description.trim() === "" &&
        entry.options.length === 0 &&
        sectionTitles.has(normalize(entry.name))
      ) {
        continue;
      }

      if (sectionLenient) {
        const twin = kept.find((candidate) =>
          !candidate.sources.has(sourceIndex) &&
          (twinFoldCandidate(candidate.item, entry) ||
            nullGramsTwinFoldCandidate(candidate.item, entry))
        );
        if (twin) {
          if (nullGramsTwinFoldCandidate(twin.item, entry)) {
            if (twin.item.price === null && entry.price === null) {
              twin.item = richer(twin.item, entry);
            } else if (
              twin.item.price === null ||
              (entry.price !== null && entry.price > twin.item.price)
            ) {
              twin.item = entry;
              twin.primarySource = sourceIndex;
            }
            twin.sources.add(sourceIndex);
            continue;
          }
          const currentCount =
            sectionCounts[sourceIndex].get(entry.section_title) ?? 0;
          const keptCount =
            sectionCounts[twin.primarySource].get(twin.item.section_title) ?? 0;
          if (currentCount > keptCount) {
            twin.item = entry;
            twin.primarySource = sourceIndex;
          }
          twin.sources.add(sourceIndex);
          continue;
        }
      }

      const match = kept.find(
        (candidate) =>
          !candidate.sources.has(sourceIndex) &&
          duplicate(candidate.item, entry, sectionLenient),
      );
      if (match) {
        match.item = richer(match.item, entry);
        match.sources.add(sourceIndex);
      } else {
        kept.push({
          item: entry,
          sources: new Set([sourceIndex]),
          primarySource: sourceIndex,
        });
      }
    }
  });

  function dropTileTruncations(
    kept: {
      item: ExtractedMenuItem;
      sources: Set<number>;
      primarySource: number;
    }[],
  ): {
    item: ExtractedMenuItem;
    sources: Set<number>;
    primarySource: number;
  }[] {
    return kept.filter((candidate, index, all) =>
      !all.some((other, otherIndex) =>
        otherIndex !== index &&
        other.primarySource !== candidate.primarySource &&
        candidate.item.section_title === other.item.section_title &&
        candidate.item.price !== null &&
        candidate.item.price === other.item.price &&
        strictWordSubset(candidate.item.name, other.item.name)
      )
    );
  }

  const merged = sectionLenient ? dropTileTruncations(kept) : kept;
  return merged.map(({ item }) => item);
}
