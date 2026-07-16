import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assessVerdicts, EVAL069_GROUPS } from "./probe-paired-ambiguity.ts";

type ExpectedPair = { id: string; expected: "a" | "b" | "neither" };

Deno.test(
  "eval 069 config uses exactly two calls and covers five fakes plus three controls",
  () => {
    assertEquals(EVAL069_GROUPS.length, 2);
    const pairs = EVAL069_GROUPS.flatMap((group: { pairs: ExpectedPair[] }) =>
      group.pairs
    );
    const byId = new Map(pairs.map((pair) => [pair.id, pair]));
    const fakeIds = [
      "boneless-jr",
      "coliflor",
      "buffalo",
      "ensalada-verde",
      "nuggets-coliflor",
    ];
    assertEquals(
      fakeIds.map((id) => byId.get(id)?.id),
      fakeIds,
    );
    assertEquals(
      fakeIds.map((id) => byId.get(id)?.expected),
      ["b", "b", "b", "b", "b"],
    );
    assertEquals(
      pairs.filter((pair) => pair.expected === "neither").map((pair) =>
        pair.id
      ),
      ["alitas-phase2", "distinct-sandwiches", "distinct-kids"],
    );
  },
);

Deno.test(
  "assessVerdicts reports wrong, missing, duplicate, and unexpected verdicts",
  () => {
    assertEquals(
      assessVerdicts(
        [
          { id: "wrong", expected: "b" },
          { id: "missing", expected: "a" },
          { id: "duplicate", expected: "neither" },
        ],
        [
          { id: "wrong", drop: "a" },
          { id: "duplicate", drop: "neither" },
          { id: "duplicate", drop: "neither" },
          { id: "unexpected", drop: "neither" },
        ],
      ),
      [
        "wrong drop for wrong: expected b, got a",
        "missing verdict: missing",
        "duplicate verdict: duplicate",
        "unexpected verdict: unexpected",
      ],
    );
  },
);
