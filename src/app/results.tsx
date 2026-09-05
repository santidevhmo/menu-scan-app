import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavPill } from "@/components/NavPill";
import { router, Stack } from "expo-router";
import { ChevronLeft, LoaderCircle, TriangleAlert } from "lucide-react-native";
import { colors } from "@/constants/theme";
import { useAnalysisStore } from "@/store/analysis.store";
import { useGoalsStore } from "@/store/goals.store";
import { useAllergensStore } from "@/store/allergens.store";
import { AllergenSelector } from "@/components/results/AllergenSelector";
import { GoalSelector } from "@/components/results/GoalSelector";
import { MenuItemRow } from "@/components/results/MenuItemRow";
import { resolvePiecesPerOrder } from "@/lib/portions";
import { PhaseIndicator } from "@/components/results/PhaseIndicator";
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
import { scanErrorCopy } from "@/lib/scanError";
import {
  pagesToRescan,
  scanOutcome,
  unreadablePagesMessage,
} from "@/lib/scanOutcome";
import { canonicalAllergens } from "@/data/allergens";
// import { squashZScore } from "@/lib/zScoreSort"; // used by the disabled ranked-items dump below
import type {
  EnrichmentResult,
  ExtractionResult,
  ScoredItem,
} from "@/types/scan";

type ScoredResultItem = ScoredItem & { sourceIndex: number };

/** The dead end: we read the page and it describes no dishes.
 *
 *  `6 · Unusable menu`. It draws no header and no nav pill — there is nothing
 *  to go back to inside this scan, so the screen offers the two ways out and
 *  nothing else. Reached only when `scanOutcome` says "unusable", which
 *  deliberately excludes an unreadable page: re-scanning a page we READ
 *  correctly would change nothing, but re-scanning one we could not read is
 *  exactly the right offer.
 */
function UnusableMenu() {
  return (
    <SafeAreaView
      style={{ flex: 1 }}
      edges={["top", "left", "right"]}
      className="bg-background"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 justify-center px-8 gap-2.5 self-stretch">
        <Text className="text-[26px] leading-8 tracking-[-0.39px] font-semibold text-foreground">
          Nothing here we could estimate
        </Text>
        <Text className="text-[15px] leading-[22px] text-muted-foreground">
          We read the page, but it doesn\u2019t describe any dishes \u2014 no
          ingredients, no plates, nothing to weigh. A drinks list or a cover
          page usually looks like this.
        </Text>
      </View>
      <View className="px-6 pb-[34px] gap-2.5 self-stretch">
        <Pressable
          onPress={() => router.back()}
          className="items-center justify-center py-4 rounded-full bg-foreground"
          accessibilityRole="button"
          accessibilityLabel="Try another photo"
        >
          <Text className="text-base leading-5 font-semibold text-background">
            Try another photo
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.navigate("/")}
          className="items-center justify-center py-[15px] rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Go home"
        >
          <Text className="text-base leading-5 font-semibold text-foreground">
            Go home
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** The pending button's 18 px arc.
 *
 *  The ONE animation in the app. Santiago ruled on 2026-09-05 that it spins and
 *  that 1000 ms / linear / infinite is the timing. Linear and not eased: a
 *  continuous rotation with an ease curve has no rest position to settle into,
 *  so it reads as stuttering rather than spinning.
 *
 *  `Animated.View` + `useNativeDriver` means an inline transform — one of the
 *  documented cases in AGENTS.md's Style Exception List where NativeWind does
 *  not apply. Do not reach for a `className` animation here.
 */
function SpinningArc() {
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: spin.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      }}
    >
      <LoaderCircle size={18} color={colors.dim} strokeWidth={2} />
    </Animated.View>
  );
}

/** A screen section: a caps eyebrow, a quiet sub-caption, then its controls. */
function Section({
  eyebrow,
  caption,
  className,
  children,
}: {
  eyebrow: string;
  caption: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <View className={`px-6 self-stretch ${className}`}>
      <View className="gap-0.5">
        <Text className="text-[11px] leading-[14px] tracking-[0.88px] font-semibold text-foreground">
          {eyebrow}
        </Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          {caption}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** The callout panel that carries a failure the user can act on. */
function Callout({ title, body }: { title: string; body: string }) {
  return (
    <View className="self-stretch bg-muted rounded-xl p-4 gap-[7px]">
      <View className="flex-row items-center gap-2">
        <TriangleAlert size={16} strokeWidth={1.3} color={colors.foreground} />
        <Text className="text-[15px] leading-5 font-semibold text-foreground shrink">
          {title}
        </Text>
      </View>
      <Text className="text-[13px] leading-[19px] text-muted-foreground">
        {body}
      </Text>
    </View>
  );
}

/** Renders goal selection while OCR continues in the background. */
function GoalsPhase({
  loading,
  result,
  selectedGoals,
  onToggleGoal,
  selectedAllergens,
  onToggleAllergen,
  onContinue,
}: {
  loading: boolean;
  result: ExtractionResult | null;
  selectedGoals: string[];
  onToggleGoal: (goal: string) => void;
  selectedAllergens: string[];
  onToggleAllergen: (allergen: string) => void;
  onContinue: () => void;
}) {
  // A transport failure and an unreadable page are different things. The first
  // is ours and its copy lives in scanError; the second is the photo's, and
  // the fix is a new one. `result.error` is developer-facing and never renders.
  const failure = result?.error
    ? scanErrorCopy(result.error_code ?? null)
    : null;
  const rescan = result ? pagesToRescan(result.pages, result.items.length) : [];
  const ocrDone = !!result && !failure;
  const canContinue =
    ocrDone && rescan.length === 0 && selectedGoals.length > 0;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="px-6 pt-2 self-stretch">
          <View className="flex-row items-center gap-1 -ml-2">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              className="w-10 h-10 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              {/* See review.tsx: the artboard's chevron is a 12 x 20 glyph at a
                  flat 2 px stroke, and lucide scales its stroke with its size. */}
              <ChevronLeft
                size={40}
                strokeWidth={1.2}
                color={colors.foreground}
              />
            </Pressable>
            <Text className="text-[24px] leading-[30px] tracking-[-0.24px] font-semibold text-foreground">
              What are you after?
            </Text>
          </View>
        </View>

        <Section
          className="pt-5 gap-2.5"
          eyebrow="SORT THE MENU BY"
          caption="Pick as many as you like · they count equally"
        >
          <GoalSelector selected={selectedGoals} onToggle={onToggleGoal} />
        </Section>

        <Section
          className="pt-7 gap-3"
          eyebrow="INGREDIENTS TO AVOID"
          caption="Allergies hide the dish"
        >
          <AllergenSelector
            selected={selectedAllergens}
            onToggle={onToggleAllergen}
          />
        </Section>
      </ScrollView>

      <View className="px-6 pb-[34px] gap-2.5 self-stretch">
        {failure ? (
          <Callout title="We couldn't finish the scan" body={failure.message} />
        ) : rescan.length > 0 ? (
          <Callout
            title="We couldn't read the photo"
            body={unreadablePagesMessage(rescan)}
          />
        ) : null}

        {loading && !failure ? (
          <>
            <View className="flex-row items-center justify-center gap-2.5 py-4 rounded-full bg-rule">
              <SpinningArc />
              <Text className="text-base leading-5 font-semibold text-dim">
                Reading the menu…
              </Text>
            </View>
            <Text className="text-xs leading-4 text-center text-dim">
              Keep picking — this finishes on its own
            </Text>
          </>
        ) : failure || rescan.length > 0 ? (
          <>
            <Pressable
              onPress={() => router.back()}
              className="items-center justify-center py-4 rounded-full bg-foreground"
              accessibilityRole="button"
              accessibilityLabel="Scan again"
            >
              <Text className="text-base leading-5 font-semibold text-background">
                Scan again
              </Text>
            </Pressable>
            <Text className="text-xs leading-4 text-center text-dim">
              Your goals and avoid list stay exactly as they are
            </Text>
          </>
        ) : (
          <Pressable
            onPress={onContinue}
            disabled={!canContinue}
            className={`items-center justify-center py-4 rounded-full ${
              canContinue ? "bg-foreground" : "bg-rule"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Continue to results"
            accessibilityState={{ disabled: !canContinue }}
          >
            <Text
              className={`text-base leading-5 font-semibold ${
                canContinue ? "text-background" : "text-dim"
              }`}
            >
              Continue
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Phase 1: the goal-ranked list of enriched menu items. */
function ResultsPhase({
  loading,
  result,
  selectedGoals,
  selectedAllergens,
}: {
  loading: boolean;
  result: EnrichmentResult | null;
  selectedGoals: string[];
  selectedAllergens: string[];
}) {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [revealHidden, setRevealHidden] = useState(false);
  const [portions, setPortions] = useState<Record<number, number>>({});
  // What one order is cut into, once the diner has corrected it. Kept apart
  // from `portions` so the model's count stays the default until they do.
  const [pieces, setPieces] = useState<Record<number, number>>({});
  const hasAllergenFilter = selectedAllergens.length > 0;
  const sorted: ScoredResultItem[] = useMemo(() => {
    if (!result || result.error) return [];
    const withIndex = result.items.map((item, sourceIndex) => ({
      ...item,
      sourceIndex,
    }));
    // Canonicalise before matching: the model answers in prose, so `peanut`
    // and `tree nuts` appear alongside `peanuts` and `nuts`. Comparing raw
    // strings makes those near-misses fail silently, which on this filter
    // means an allergen dish is shown rather than hidden (eval 191).
    const itemMatchesAllergen = (item: { allergens: string[] }) =>
      hasAllergenFilter &&
      canonicalAllergens(item.allergens).some((allergen) =>
        selectedAllergens.includes(allergen),
      );
    const active =
      hasAllergenFilter && !revealHidden
        ? withIndex.filter((item) => !itemMatchesAllergen(item))
        : withIndex;

    return sortItemsByGoals(active, selectedGoals);
  }, [
    result,
    selectedGoals,
    selectedAllergens,
    hasAllergenFilter,
    revealHidden,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale per-result UI state for a new scan result
    setPortions({});
    setPieces({});
    setRevealHidden(false);
  }, [result]);

  useEffect(() => {
    if (!__DEV__ || !result || result.error || result.items.length === 0)
      return;

    // Full ranked-items JSON dump disabled (ticket #3 console-noise pass):
    // re-enable when debugging Stage-2 ranking; the [rank top10] block below
    // covers everyday sanity checks. Uses squashZScore(item.alignment_score)
    // for display_score when restored.
    // console.log(
    //   JSON.stringify(
    //     {
    //       selected_goals: selectedGoals,
    //       total_items: sorted.length,
    //       items: sorted.map((item, index) => ({
    //         rank: index + 1,
    //         name: item.name,
    //         macros: {
    //           protein_g: item.protein_g,
    //           carb_g: item.carb_g,
    //           fat_g: item.fat_g,
    //           estimated_calories: item.estimated_calories,
    //         },
    //         alignment_score: item.alignment_score,
    //         display_score: squashZScore(item.alignment_score),
    //         goal_scores: item.goal_scores,
    //         allergens: item.allergens,
    //       })),
    //     },
    //     null,
    //     2,
    //   ),
    // );
    console.log(
      "[rank top10]\n" +
        sorted
          .slice(0, 10)
          .map(
            (item, index) =>
              `${String(index + 1).padStart(2)}. ${item.name} ` +
              `P${item.protein_g} C${item.carb_g} F${item.fat_g} ` +
              `cal${item.estimated_calories} score=${item.alignment_score.toFixed(2)}`,
          )
          .join("\n"),
    );
    console.log(
      "[allergens top10]\n" +
        sorted
          .slice(0, 10)
          .map(
            (item, index) =>
              `${String(index + 1).padStart(2)}. ${item.name}: ${
                item.allergens.length > 0 ? item.allergens.join(", ") : "none"
              }`,
          )
          .join("\n"),
    );
  }, [result, selectedGoals, sorted]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <ActivityIndicator size="large" color={colors.foreground} />
        <Text className="font-sans text-caption text-muted-foreground mt-3 text-center">
          Enriching menu items...
        </Text>
      </View>
    );
  }

  if (!result) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-subtle text-muted-foreground text-center">
          No items to rank.
        </Text>
      </View>
    );
  }

  if (result.error) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-body text-danger text-center">
          {scanErrorCopy(result.error_code ?? null).message}
        </Text>
      </View>
    );
  }

  if (result.items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-subtle text-muted-foreground text-center">
          No items to rank.
        </Text>
      </View>
    );
  }

  const highlight = selectedMacros(selectedGoals);
  const lowConfidence =
    result.items.filter((item) => item.confidence === "low").length /
      result.items.length >=
    0.75;
  const matchesAllergen = (item: { allergens: string[] }) =>
    item.allergens.some((allergen) => selectedAllergens.includes(allergen));
  const hiddenCount = hasAllergenFilter
    ? result.items.filter(matchesAllergen).length
    : 0;

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => String(item.sourceIndex)}
      contentContainerClassName="px-6 pb-10"
      ListHeaderComponent={
        <>
          {hasAllergenFilter && (
            <View className="rounded-card border border-border bg-card p-4 mb-3">
              <Text className="font-sans text-body text-danger">
                AI-estimated. Confirm allergens with restaurant staff before
                ordering.
              </Text>
            </View>
          )}
          {hiddenCount > 0 && (
            <Pressable
              onPress={() => setRevealHidden((value) => !value)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={
                revealHidden
                  ? "Hide allergen items"
                  : "Show hidden allergen items"
              }
            >
              <Text className="font-sans text-body text-foreground">
                {revealHidden
                  ? `Showing ${hiddenCount} hidden ${
                      hiddenCount === 1 ? "item" : "items"
                    } · Hide`
                  : `${hiddenCount} ${
                      hiddenCount === 1 ? "item" : "items"
                    } hidden due to allergens · Show anyway`}
              </Text>
            </Pressable>
          )}
          {lowConfidence && !noticeDismissed ? (
            <Pressable
              onPress={() => setNoticeDismissed(true)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Dismiss low-confidence notice"
            >
              <Text className="font-sans text-body text-foreground">
                Descriptions on this menu are light on details.
              </Text>
              <Text className="font-sans text-subtle text-muted-foreground mt-1">
                Nutritional estimates are rough because the menu does not list
                ingredients. For confident choices, ask your waiter. Tap to
                dismiss.
              </Text>
            </Pressable>
          ) : null}
        </>
      }
      renderItem={({ item, index }) => {
        const id = item.sourceIndex;

        return (
          <MenuItemRow
            item={item}
            rank={index + 1}
            highlight={highlight}
            portion={portions[id] ?? 1}
            piecesPerOrder={
              pieces[id] ?? resolvePiecesPerOrder(item.serving_pieces)
            }
            selectedAllergens={selectedAllergens}
            onPortionEdit={(portion, piecesPerOrder) => {
              setPortions((prev) => ({ ...prev, [id]: portion }));
              setPieces((prev) => ({ ...prev, [id]: piecesPerOrder }));
            }}
          />
        );
      }}
    />
  );
}

/** Results screen for reviewing OCR output and downstream placeholder phases. */
export default function ResultsScreen() {
  const { extraction, extractionLoading, enrichment, enrichmentLoading } =
    useAnalysisStore();
  const selectedGoals = useGoalsStore((state) => state.selectedGoals);
  const toggleGoal = useGoalsStore((state) => state.toggleGoal);
  const selectedAllergens = useAllergensStore(
    (state) => state.selectedAllergens,
  );
  const toggleAllergen = useAllergensStore((state) => state.toggleAllergen);
  const [phase, setPhase] = useState(0);

  const ocrDone = !!extraction && !extraction.error;
  const unusable =
    ocrDone &&
    scanOutcome(extraction.pages, extraction.items.length) === "unusable";

  const canNavigate = (target: number) => {
    if (target === 0) return true;
    return ocrDone && selectedGoals.length > 0;
  };

  const goTo = (target: number) => {
    if (canNavigate(target)) setPhase(target);
  };

  if (unusable) return <UnusableMenu />;

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      {phase > 0 && (
        <>
          <View className="flex-row items-center px-6 pt-2">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              className="w-10 h-10 items-center justify-center -ml-2"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft
                size={26}
                color={colors.foreground}
                strokeWidth={2}
              />
            </Pressable>
            <Text className="font-display text-h1 text-foreground ml-1">
              Results
            </Text>
          </View>

          <PhaseIndicator
            current={phase}
            canNavigate={canNavigate}
            onSelect={goTo}
          />
        </>
      )}

      <View className="flex-1">
        {phase === 0 && (
          <GoalsPhase
            loading={extractionLoading}
            result={extraction}
            selectedGoals={selectedGoals}
            onToggleGoal={toggleGoal}
            selectedAllergens={selectedAllergens}
            onToggleAllergen={toggleAllergen}
            onContinue={() => goTo(1)}
          />
        )}
        {phase === 1 && (
          <ResultsPhase
            loading={enrichmentLoading}
            result={enrichment}
            selectedGoals={selectedGoals}
            selectedAllergens={selectedAllergens}
          />
        )}
      </View>
      {/* `3 · Goals` draws no nav row — its bottom block is the pending button
          and its caption. Only `18 · Results` floats the pill. */}
      {phase > 0 && <NavPill />}
    </SafeAreaView>
  );
}
