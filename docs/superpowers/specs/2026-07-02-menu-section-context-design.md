# Menu Section Context Design

## Goal

Preserve printed item names while retaining the nearest menu heading needed to
understand short names such as `Revueltos`, `Fritos`, or `De la Sierra`.

## Contract

Each extracted item keeps its printed `name`, receives the broad selectable
`category` enum, and records the nearest printed heading:

```json
{
  "name": "Revueltos",
  "section_title": "Huevos",
  "category": "food"
}
```

`section_title` is a required `string | null`. The model must copy it from the
menu and must not synthesize or prepend it to `name`.

## Presentation

The result title preserves the exact printed item name and adds the section as
context:

```text
Huevos → Revueltos
```

When `section_title` is null, the UI shows only `name`. It must not create a new
combined title such as `Huevos Revueltos`.

## Extraction and scoring

The extraction prompt requests only the nearest printed section heading for
every item. Parent hierarchy is intentionally discarded. Likely headings are
larger than item text, have no adjacent price, weight, or description, and
visually group items beneath them. The model must use these as supporting cues,
not as independent rules.

The harness checks expected nearest-section names and selected item-to-section
mappings, beginning with the El Marcos `Huevos` section. This avoids asking the
model to decide whether a name is semantically incomplete.

## Scope

This change affects the Stage 1 extraction contract and evaluation harness.
Client rendering and Stage 2 per-option nutrition remain out of scope.
