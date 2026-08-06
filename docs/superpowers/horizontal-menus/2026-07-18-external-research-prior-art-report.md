# External research report #2 — prior art on cross-card recombination (delivered 2026-07-18)

> Archived from chat (planner review = ledger eval 080). The report answered
> `2026-07-18-external-research-prompt-prior-art.md`. Two answer versions were delivered;
> answer 1 was truncated in transfer mid-way through its Mistral OCR 4 paragraph; answer 2
> is complete and covers all six questions. Key claims verified/corrected by the planner in
> eval 080 (notably: we were ALREADY on Mistral OCR 4).

## Bottom line (both answers agree)

Nobody has publicly eliminated cross-card field recombination. No platform, vendor, API, or
paper claims — or even measures — a bound on relational/field-binding hallucination in
dense-layout extraction. Production systems bound it with (a) layout-first segmentation,
(b) post-hoc provenance/citation checks, and (c) confidence-gated human review. Our pipeline
= (a-lite) + (b) with no human loop.

## 1. Delivery platforms
- DoorDash (March 2025) is the only public technical description of photo→menu extraction;
  it names our failure mode ("difficulty in the correct linkage between items and their
  attributes"; arbitrary OCR ordering breaks item↔attribute linkage). Their fix is NOT
  structural: a LightGBM guardrail classifier over image/OCR/LLM-output features predicts
  whole-transcription trustworthiness; below-threshold → human transcription. LightGBM beat
  ResNet/ViT variants. Admissions: after six months testing newer models "none significantly
  outperforms the others"; multimodal models were MORE error-prone on bad photos than
  OCR+LLM. No absolute error rates published (tables are images). Human review remains the
  backstop. Newer DoorDash posts (Jun 2025 description generation; Jul 2026 metadata
  platform with LLM juries) do not address transcription grounding.
- Uber Eats, Grubhub/JET, Deliveroo, Wolt, Rappi, iFood, Meituan, Ele.me: nothing found
  post-2024 (no Chinese-language or patent search — "not found", not "does not exist").

## 2. Menu-digitization vendors / POS integrators
No vendor advertises photo→menu extraction with accuracy/hallucination guarantees; most
don't do photo extraction at all (Checkmate/Deliverect sync via POS APIs; Deliverect AI
(Apr 2026) is menu merchandising, not extraction; Klippa DocHorizon = marketing, no numbers).
Menu digitization is still sold as a human-in-the-loop service priced per menu — itself
evidence about the state of the art.

## 3. Document-AI products with field-level provenance
- Reducto Extract: closest productized match — per-field bounding-box citations with
  confidence + parentBlock, "visible-only" schema philosophy, layout-aware region models
  before VLM reads. Grade: feature verified, guarantee NOT — a citation proves the extractor
  pointed at a region, not that the value came from it; same-name-wrong-price twins survive
  a name-box citation check. Much detail is self-published (llms.reducto.ai); benchmarks are
  their own (RD-TableBench).
- Ironclad (May 2026): candid grounding-system failure list — normalization gaps,
  multi-instance ambiguity (same string in 3 places, one correct citation), OCR hyphenation,
  semantic equivalence — "each defeats lexical similarity"; "you need a system that reasons
  about where a value came from". Their multi-instance ambiguity = our same-name twin class.
- LlamaParse: granular sub-line bounding boxes in beta (Jun 9, 2026) — relevant to
  mega-block/coarse-box problems.
- Mistral OCR 4 (verified docs.mistral.ai, Jul 18 2026): released Jun 23 2026; paragraph
  bounding boxes, structural block labels, per-word confidence; $4/1k pages, $5/1k annotated;
  85.20 OlmOCRBench, 93.07 OmniDocBench, 170 languages. [Planner note: we were already on it.]
- VLM self-reported boxes remain broken (corroborates our eval-070 finding): ParseBench —
  Gemini 3 Flash localizes ~half of elements, scores 43.2% (misclassified/wrong-text
  localizations; big-region emitters score ~0); ViDoRe V3 (Jan 2026) — Gemini off-by-one page
  grounding + wrong-table boxes; Qwen3-VL section-spanning boxes. Google's own Gemini 3
  guidance points to agentic zoom-and-crop rather than direct grounding.

## 4. Academic / open-source — the one structural mechanism
- PaddleOCR-VL: layout-first crop-then-recognize with our failure mode as stated motivation
  (end-to-end VLM parsing risks unstable layout + hallucinations, worst on multi-column).
  PP-DocLayoutV2 (RT-DETR + pointer network) detects regions & reading order → element
  crops → VLM per crop → merge. Cross-region borrowing geometrically impossible WITHIN
  correctly detected regions. v1.5: multi-point polygon localization for perspective/curvature;
  v1.6 (May 28, 2026): 96.3% OmniDocBench. CATCH: a menu card is a semantic unit, not a
  layout class — needs a fine-tuned card detector; guarantee = segmentation quality.
- olmOCR document-anchoring: injecting extracted text blocks + positions into the VLM prompt
  significantly reduces hallucinations vs image-only prompting; also documents GPT-4o
  omitting/rewriting content on high-density pages (our model, our failure).
- GutenOCR (arXiv 2601.14490, Jan 2026; Qwen2.5-VL 3B/7B fine-tune, open weights):
  conditional detection (query string → boxes of every line containing it; empty array when
  absent) F1@0.5 0.877/0.882; localized reading (box as parameter + full page, no pixel
  crop) region CER 0.053. A purpose-built verification primitive; zero menu-domain eval.
- Benchmarks measuring cross-region binding errors at ~zero: NONE exist. ExtractBench
  (Feb 2026): right methodology (array alignment, omission-vs-hallucination null semantics),
  no spatial component. IndustryBench-MIPU (Jun 2026): 86–94% precision, best recall 49.9%
  of product attributes; binding errors never reported as a class. Count metrics hiding this
  failure class is confirmed by literature omission.

## 5. Trick space
(a) Per-card crop-then-extract: shipped/published (PaddleOCR-VL, MinerU2.5, dots.ocr);
    measured on parsing fidelity, never binding errors.
(b) Copy-only constrained decoding over OCR tokens: NOBODY found — unclaimed ground;
    grammar engines (XGrammar, Outlines, llguidance) make it constructible; the only
    mechanism making name-minting IMPOSSIBLE rather than detectable; composes with (a).
(c) Better matchers: do NOT move to embeddings ("Ensalada de Pollo"≈"Ensalada Pollotera"
    are neighbors — a semantic matcher validates the fabrication). Stricter-not-smarter:
    every name token inside ONE block/card polygon; price/weight span from that same block.
(d) OCR behavior under crops (tiles → fragment blocks; flush crops → mega-block; white
    margin restores segmentation): NO prior documentation found — our eval-079 measurements
    are original. Adjacent evidence: PaddleOCR crops after full-page detection; olmOCR
    anchors on full-page text. Practical rule: never crop before OCR.

## 6. Three adoptables (report's ranking)
1. Layout-first region segmentation (PP-DocLayoutV3 or RT-DETR fine-tuned on menu cards) →
   per-region extraction. Apache-2.0, ~0.9B self-hosted. Structural within correct regions;
   no published binding-error measurement; degrades with the card detector.
2. Copy-only constrained decoding over the OCR lattice. Unpublished; the impossibility
   mechanism; prototype-worthy; composes with (1).
3. Grounded conditional-detection verification replacing fuzzy matching (GutenOCR-3B
   self-hosted or Mistral OCR 4 $4/1k). Cheapest bolt-on; zero menu-domain evidence.

## Could not verify
DoorDash residual error rates/automation ratio; any vendor accuracy guarantee; non-US
platform practice; patents; any mechanism actually zeroing cross-card recombination on any
document type — no one has published that measurement. Building the eval would be the first
public benchmark for this failure class (we hold labeled cases of all three sub-types).

## Sources flagged by the researcher as potentially useful
- https://github.com/Obad94/OCR-Menu-Reader
- https://docs.reducto.ai/overview
- https://llms.reducto.ai/form-field-labeling-guide
