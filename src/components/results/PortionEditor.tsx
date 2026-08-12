import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import {
  parsePiecesInput,
  parsePortionInput,
  portionFromUnitCount,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  unitCount,
} from "@/lib/portions";

interface PortionEditorProps {
  /** The dish name, so the diner knows which row they opened. */
  name: string;
  portion: number;
  piecesPerOrder: number;
  /** Calories for the WHOLE order; null when the item could not be decomposed. */
  caloriesPerOrder: number | null;
  onClose: () => void;
  onSubmit: (portion: number, piecesPerOrder: number) => void;
}

/**
 * One editor for both numbers: how much the diner will have, and what the dish
 * comes in. It is the only route by which a dish the model called whole can be
 * cut into slices, which is the Margherita case - all 26 Bistro pizzas came
 * back as 1 piece on 2026-08-11.
 *
 * Both fields are numeric. Nothing typed here reaches a model, so there is no
 * prompt-injection surface (Santiago, 2026-08-11).
 *
 * The caller mounts this only while it is open, so the draft below seeds from
 * the row's current values on every open - no effect, and no way for the last
 * row's typing to show up on the next one.
 */
export function PortionEditor({
  name,
  portion,
  piecesPerOrder,
  caloriesPerOrder,
  onClose,
  onSubmit,
}: PortionEditorProps) {
  const fmt = (value: number) => String(Math.round(value * 100) / 100);
  // The quantity field counts the dish's OWN unit - rolls for a roll, plates
  // for a steak - so that typing 18 on a 12-roll plate means eighteen rolls,
  // the way Santiago read it on 2026-08-11. `share` is the same number in
  // orders, and it is the one the macros use.
  const [quantity, setQuantity] = useState(
    fmt(unitCount(portion, piecesPerOrder)),
  );
  const [divisor, setDivisor] = useState(String(piecesPerOrder));
  const [share, setShare] = useState(portion);

  const parsedQuantity = parsePortionInput(quantity);
  const parsedDivisor = parsePiecesInput(divisor);
  const canSave = parsedQuantity !== null && parsedDivisor !== null;
  const pieces = parsedDivisor ?? piecesPerOrder;

  const editQuantity = (text: string) => {
    const clean = sanitizeDecimalInput(text);
    setQuantity(clean);
    const parsed = parsePortionInput(clean);
    if (parsed !== null) setShare(portionFromUnitCount(parsed, pieces));
  };

  // Changing the divisor keeps the SHARE, never the count: 4 of 8 becomes
  // 6 of 12, because the app is used before ordering (Santiago, 2026-08-11).
  // Holding `share` in its own state is what makes this survive typing a
  // two-digit divisor one keystroke at a time.
  const editDivisor = (text: string) => {
    const clean = sanitizeIntegerInput(text);
    setDivisor(clean);
    const next = parsePiecesInput(clean);
    if (next !== null) setQuantity(fmt(unitCount(share, next)));
  };

  // Reads off the DRAFT divisor so it moves while they type. Only meaningful
  // once a dish has pieces - "each piece" of a soup is the soup.
  const footnote =
    caloriesPerOrder !== null && parsedDivisor !== null && parsedDivisor > 1
      ? `Whole order ${Math.round(caloriesPerOrder)} cal — each piece about ` +
        `${Math.round(caloriesPerOrder / parsedDivisor)} cal.`
      : "Changing what it comes in never changes the nutrition.";

  const nudgeQuantity = (direction: 1 | -1) => {
    // One piece per tap where the dish has pieces, half an order where it does
    // not. Both are whole numbers in the unit on screen, so 0.17 - which is
    // what one piece looked like when this field counted orders - cannot
    // appear (Santiago, 2026-08-11).
    const step = pieces > 1 ? 1 : 0.5;
    const current = parsedQuantity ?? unitCount(share, pieces);
    // The stepper floors at one step; only typing goes below it.
    const next = Math.max(step, current + direction * step);
    setQuantity(fmt(next));
    setShare(portionFromUnitCount(next, pieces));
  };

  const nudgeDivisor = (direction: 1 | -1) => {
    const next = Math.min(50, Math.max(1, pieces + direction));
    setDivisor(String(next));
    setQuantity(fmt(unitCount(share, next)));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        onPress={onClose}
        accessibilityLabel="Close portion editor"
      >
        <Pressable
          className="w-full rounded-card bg-background border border-border p-5"
          onPress={() => {}}
        >
          <Text
            className="font-display text-body text-foreground"
            numberOfLines={2}
          >
            {name}
          </Text>

          <EditorField
            label="I'll have"
            value={quantity}
            valid={parsedQuantity !== null}
            keyboardType="decimal-pad"
            onChangeText={editQuantity}
            onDecrease={() => nudgeQuantity(-1)}
            onIncrease={() => nudgeQuantity(1)}
          />
          <EditorField
            label="comes in"
            value={divisor}
            valid={parsedDivisor !== null}
            keyboardType="number-pad"
            onChangeText={editDivisor}
            onDecrease={() => nudgeDivisor(-1)}
            onIncrease={() => nudgeDivisor(1)}
          />

          {/* The plate is what carries the calories, and it does not move when
              the divisor does - which reads as "nothing happened" unless the
              per-piece number is on screen to be seen changing. Santiago hit
              exactly that doubt on a 397 kcal roll, 2026-08-11. */}
          <Text className="font-sans text-caption text-muted-foreground mt-4">
            {footnote}
          </Text>

          <View className="flex-row justify-end items-center mt-4 gap-4">
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Text className="font-sans text-button text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                // Narrowed one at a time: `canSave` is a boolean, and TS will
                // not narrow the two values through it. The typed count is in
                // the dish's unit; the row and the macros want the share.
                if (parsedQuantity !== null && parsedDivisor !== null) {
                  onSubmit(
                    portionFromUnitCount(parsedQuantity, parsedDivisor),
                    parsedDivisor,
                  );
                }
              }}
              disabled={!canSave}
              hitSlop={8}
              className={`rounded-full bg-foreground px-5 py-2 ${
                canSave ? "" : "opacity-40"
              }`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              <Text className="font-sans text-button text-background">
                Done
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One labelled row: minus, a typable number, plus. */
function EditorField({
  label,
  value,
  valid,
  keyboardType,
  onChangeText,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  valid: boolean;
  /** decimal-pad for a quantity, number-pad for a count of pieces. */
  keyboardType: "decimal-pad" | "number-pad";
  onChangeText: (text: string) => void;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between mt-4">
      <Text className="font-sans text-subtle text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onDecrease}
          hitSlop={8}
          className="w-8 h-8 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          selectTextOnFocus
          className={`w-16 h-8 rounded-chip bg-card font-sans text-body ${
            valid ? "text-foreground" : "text-danger"
          }`}
          // NOT `text-center`. nativewind 5.0.0-preview.4 ships a TextInput
          // whose nativeStyleMapping is `{ textAlign: true }`, while the code
          // consuming it calls `path.split(".")` - so any class that sets
          // textAlign crashes the render with "undefined is not a function".
          // Button and ActivityIndicator use string paths and are fine; the
          // bug is upstream and only TextInput and ImageBackground carry it.
          // Per the AGENTS.md Style Exception List, style wins where className
          // cannot go. Revisit when nativewind leaves preview.
          style={{ textAlign: "center" }}
          accessibilityLabel={label}
        />
        <Pressable
          onPress={onIncrease}
          hitSlop={8}
          className="w-8 h-8 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Plus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
