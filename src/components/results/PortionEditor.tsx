import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import {
  parsePiecesInput,
  parsePortionInput,
  portionStep,
} from "@/lib/portions";

interface PortionEditorProps {
  /** The dish name, so the diner knows which row they opened. */
  name: string;
  portion: number;
  piecesPerOrder: number;
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
  onClose,
  onSubmit,
}: PortionEditorProps) {
  const [quantity, setQuantity] = useState(String(portion));
  const [divisor, setDivisor] = useState(String(piecesPerOrder));

  const parsedQuantity = parsePortionInput(quantity);
  const parsedDivisor = parsePiecesInput(divisor);
  const canSave = parsedQuantity !== null && parsedDivisor !== null;

  const nudgeQuantity = (direction: 1 | -1) => {
    const current = parsedQuantity ?? portion;
    const step = portionStep(parsedDivisor ?? piecesPerOrder);
    // The stepper floors at one step; only typing goes below it.
    const next = Math.max(step, current + direction * step);
    setQuantity(String(Math.round(next * 100) / 100));
  };

  const nudgeDivisor = (direction: 1 | -1) => {
    const current = parsedDivisor ?? piecesPerOrder;
    setDivisor(String(Math.min(50, Math.max(1, current + direction))));
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
            onChangeText={setQuantity}
            onDecrease={() => nudgeQuantity(-1)}
            onIncrease={() => nudgeQuantity(1)}
          />
          <EditorField
            label="comes in"
            value={divisor}
            valid={parsedDivisor !== null}
            onChangeText={setDivisor}
            onDecrease={() => nudgeDivisor(-1)}
            onIncrease={() => nudgeDivisor(1)}
          />

          <Text className="font-sans text-caption text-muted-foreground mt-3">
            Changing what it comes in never changes the nutrition.
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
                // not narrow the two values through it.
                if (parsedQuantity !== null && parsedDivisor !== null) {
                  onSubmit(parsedQuantity, parsedDivisor);
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
  onChangeText,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  valid: boolean;
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
          keyboardType="decimal-pad"
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
