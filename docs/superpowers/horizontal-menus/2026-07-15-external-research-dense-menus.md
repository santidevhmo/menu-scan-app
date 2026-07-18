# Reliable OCR and Structured Extraction of Dense Horizontal Restaurant Menus: An Evidence-Based Investigation

*Research current as of 2026-07-15. Claims are linked to primary sources where possible; inference is labeled explicitly.*

## TL;DR
- **The problem is not "solved" — cross-card field recombination is a recognized, still-open failure class of pure vision-language extraction. But it is materially reduceable in production by a layout-first / bounding-box-grounded architecture rather than by prompt tuning or count tolerances.** For Menu Scan the highest-leverage move is a hybrid pipeline: a spatial OCR/layout parser produces words + coordinates + region boxes, and the VLM/LLM only *groups already-bounded tokens into cards* — this attacks the root cause (spatial ownership) instead of patching symptoms.
- **Prevention beats detection.** Reducing density (nested sub-tiles only on the overloaded crop) and constraining the model with geometry (OCR tokens/bounding boxes) prevent the fake before it is created; post-hoc verifiers that lack spatial evidence either miss "mashups" (the words are all genuinely present) or delete real dishes. Any verifier you add must require *co-located* name+price+description evidence within one region box, not semantic plausibility.
- **Guided multi-photo capture is worth piloting, but pixel-level stitching of one menu is a documented duplicate-generator** (repeated menu text causes false feature matches and ghosting). The defensible version is guided *non-overlapping region capture* with coverage guidance + per-region quality gating, then merge at the structured-data level — not pixel mosaicing.

## Key Findings

1. **Terminology.** The literature calls this: reading-order detection / multi-column reading order; entity–attribute (item↔attribute) linkage; table/document structure recognition (cell/row/column association); layout parsing; visual grounding; and VLM/OCR hallucination (object/attribute/relational). DoorDash names your exact symptom "item↔attribute linkage" failure.

2. **Root cause.** VLMs encode high-resolution pages as fixed tiles (LLaVA-NeXT "AnyRes"; InternVL dynamic tiling; Qwen2.5-VL naive dynamic resolution). Dense regions get fragmented and the language prior "recombines" spatially-separated but co-present tokens. When a single overloaded crop contains too many cards, the model loses spatial ownership and emits plausible mashups. This is inherent to token-based image encoding, not a prompt defect.

3. **Prevention families with real evidence:** (a) density reduction via adaptive/nested tiling; (b) layout detection → region segmentation → per-region recognition (PP-StructureV3, PaddleOCR-VL, dots.ocr, Docling); (c) OCR tokens + coordinates first, then LLM grouping ("spatial OCR + LLM structuring"); (d) dedicated reading-order models (LayoutReader, PP-DocLayoutV2 pointer network, XY-Cut++).

4. **Detection families:** evidence spans / bounding-box provenance (Mistral OCR 4, Qwen2.5-VL grounding, Gemini spatial understanding); region re-crop of disputed candidates; OCR-token alignment; guardrail classifiers (DoorDash LightGBM). Detection only works if it checks *spatial co-location*, not plausibility.

5. **Commercial/OSS landscape (mid-2026):** Mistral OCR 4 (bounding boxes + confidence, per-page pricing), Google Document AI Layout Parser, Azure Document Intelligence Layout, PaddleOCR PP-StructureV3 / PaddleOCR-VL (Apache-2.0, self-host), dots.ocr/dots.mocr, Qwen2.5-VL, Gemini 3.x vision. All support Spanish + English.

6. **Guided-capture SDKs** provide real-time "too far / bad angle / ideal" callbacks and auto-capture + quality gating (Scanbot, Dynamsoft, Google ML Kit, Apple VisionKit) — all React-Native reachable — but none provide overlap/coverage guidance or single-page tile mosaicing; you build that.

## Details

### Root cause and terminology

Your observed failure — "all words exist somewhere in the image, but they are attached to the wrong printed card" — is precisely the **item↔attribute linkage** failure DoorDash documents. In DoorDash's engineering blog (Zhe Mai, Zheng Hu, Ying Yang; published March 19, 2025; updated April 15, 2025; careersatdoordash.com/blog/doordash-llm-transcribe-menu/) they state: "We have observed arbitrary ordering of text recognition that makes it more difficult for an LLM to link the right item attributes together," and dense/incomplete menus produce "extraneous or mismatched attributes, confusing the LLM on the correct item↔attribute linkage." This validates that your problem is a known, named failure class, not an idiosyncrasy.

The deeper mechanism is architectural. Modern VLMs process high-resolution images by splitting them into fixed-size tiles: LLaVA-NeXT's "AnyRes" splits images into fixed tiles; InternVL 1.5 uses dynamic 448×448 tiling up to 40 tiles (~4K) at test time; Qwen2.5-VL uses naive dynamic resolution with a default configurable budget of **256–1280 tokens per image** (Qwen2.5-VL Technical Report, arXiv 2502.13923, Qwen Team/Alibaba). Research explicitly notes uniform tiling ignores information density: "information-dense regions are inevitably fragmented across multiple sub-images and processed in a uniform" way ("Global Semantic-Guided Sub-image Feature Weight Allocation," arXiv 2501.14276). When a crop is overloaded (your ~34–36 candidates from one tile), the language prior fills spatial-ownership gaps by recombining co-present tokens — a "relational hallucination" in the VLM taxonomy.

Reading-order literature reinforces that this is a spatial, not a wording, problem. LlamaIndex's glossary: parsers "that lack layout awareness treat the page as a flat grid and read horizontally across the full page width, pulling text from column two into the middle of a sentence from column one. The result is output that is technically complete but semantically incoherent." Even purpose-built parsers struggle: Docling has open GitHub issues (#1203, #2067) where multi-column reading order "gets messed up," and a reading-order paper (arXiv 2305.02577) uses a **cropped menu** as a failure case: "the model correctly predicts the row-wise pattern, [but] reading order is still incorrect due to the perspective distortion and the unusually large spacing between the two columns." This is strong evidence that dense, wide menus are a genuinely hard structural case.

### Has it been solved?

No. There is no system with a published "zero hallucination" or zero-recombination guarantee for dense menus. Production teams **manage** it via (1) layout-first decomposition that never presents an overloaded region to the generative step, and (2) grounding/provenance so every emitted field traces to coordinates. The academic consensus is that pure end-to-end full-page VLM parsing "may suffer from … hallucination issues caused by long contexts" (MonkeyOCR, cited in MDPBench, arXiv 2603.28130), which is why the strongest 2025–2026 systems (PaddleOCR-VL, dots.ocr) explicitly **decouple layout analysis from recognition**.

### Prevention solution families

**Density reduction / nested tiling (Hypothesis A).** Evidence supports the *principle* that reducing per-region density improves fine-grained fidelity: InternVL/LLaVA-NeXT show more tiles preserve fine detail, and density-aware allocation work (2501.14276) shows uniform tiling fragments dense regions. This supports freezing your three clean parent crops and replacing only the overloaded crop with smaller overlapping sub-crops. Caveat: the literature gives no menu-specific optimal overlap; the classic document-mosaicing assumption is ~50% overlap, far more than a 2×2 split provides, so favor generous overlap (≥25%) plus text-level dedup.

**Layout detection → region segmentation → recognition.** The dominant 2025–2026 architecture. PaddleOCR's PP-StructureV3 (Apache-2.0) runs layout detection (PP-DocLayout-plus), then per-element recognition, then "post-processing to reconstruct element relationships and reading order," outputting JSON with "detailed bounding boxes, confidence scores, and recognized content for all modules." PaddleOCR-VL (arXiv 2510.14528) decouples a lightweight layout+reading-order model (PP-DocLayoutV2, an RT-DETR detector plus a 6-layer pointer network) from a 0.9B recognizer, precisely because end-to-end VLMs suffer "unstable layout analysis and hallucinations—problems that are particularly pronounced in multi-column or mixed text–graphic layouts." dots.ocr (arXiv 2512.02498; rednote-hilab) is a 1.7B unified model jointly learning "layout detection, text recognition, and relational understanding."

**Spatial OCR tokens + LLM grouping (Hypothesis D).** Now practical because multiple hosted systems return words with coordinates and typed region blocks: Mistral OCR 4 returns bounding boxes + block classification + per-word confidence; Google Document AI Layout Parser and Azure Document Intelligence Layout return text with bounding regions and reading order. The LLM's job shrinks to *grouping bounded tokens into cards under geometric constraints* — it cannot invent a card whose fields don't co-locate.

### Detection solution families

**Bounding-box provenance / evidence co-location (Hypothesis B).** The key question is whether VLMs return usable boxes or whether OCR coordinates are needed first. Qwen2.5-VL is trained on absolute-coordinate grounding and returns stable JSON boxes; Gemini 2.x/3.x support zero-shot bounding-box detection; Mistral OCR 4 returns paragraph/block boxes natively. However, VLM self-reported boxes are less reliable on dense small text than a dedicated OCR/layout system's boxes. Defensible rule: require that a candidate's name, price, weight, and description fall inside (or immediately adjacent to) *one* region box from a layout parser before accepting it — this catches mashups that survived your conservative name verifier because "the words themselves are printed."

**Guardrail classifier (DoorDash precedent, validated).** DoorDash trained a classifier on three feature families (photo, OCR output, LLM output); "the simplest model—LightGBM—outperformed all the neural network variants while also being the fastest," routing low-confidence transcriptions to human review. For a small team without a human workforce, this maps to a **confidence gate that blocks release / flags for user confirmation**, not auto-deletion.

### Additional production precedents beyond DoorDash

- **Klippa / Doxis** menu-card OCR pipeline: "a deep learning algorithm to detect bounding boxes" first, then OCR the cropped regions, then NLP to assign "what text belongs to the description, what numbers to the prices, volume." A shipped commercial validation of the layout-first, box-then-classify approach for menus specifically.
- **CORD** (Park et al., 2019, "CORD: A Consolidated Receipt Dataset for Post-OCR Parsing," NeurIPS Document Intelligence Workshop): over 11,000 Indonesian receipt images collected, 1,000 released (800 train / 100 dev / 100 test), with eight superclasses subdivided into 54 subclasses — the "menu" superclass alone has 16 subclasses including menu name, quantity, unit price, discount price, and submenu. A public dataset built precisely for the item↔attribute relation-extraction task.
- **Google TDCommons "Automatic Structured Menu Extraction from Menu Photographs"** (Bo Lin, Jinyang Yu et al.): documents that raw OCR "suffers from low quality" and NER-based approaches are "not scalable due to the requirement of a large, labeled dataset across languages" — reinforcing avoidance of a big-training-set approach.

### Commercial and open-source systems (verified mid-2026)

| Approach/system | Prevent/Detect | Bounding boxes | ES/EN | Evidence quality | Reported limitations | Integration complexity | Pricing/compute | License/privacy | Applicability |
|---|---|---|---|---|---|---|---|---|---|
| **Mistral OCR 4** (launched June 23, 2026) | Both (grounding) | Yes (per-block + per-word confidence) | Yes (170 langs, 10 groups) | High (official) but benchmarks vendor-stated | Benchmarks self-reported; not menu-specific | Low (hosted API; also SageMaker & Microsoft Foundry; single-container self-host) | $4/1k pages std, $2/1k batch; Document AI tier $5/1k | Commercial; self-host to enterprise for data residency | High: cheap page-based provenance layer |
| **Google Document AI Layout Parser** | Prevent (layout+reading order) | Yes | Yes | High (official) | GCP setup overhead; per-processor hosting fees | Medium (GCP project) | $10/1k pages (Enterprise OCR $1.50/1k, →$0.60/1k >5M; Form Parser $30/1k) | Cloud only; no training on customer data | High for layout+box tokens |
| **Azure AI Document Intelligence Layout** | Prevent | Yes (+ key-value pairs) | Yes | High (official) | Azure overhead; add-on surcharges | Medium | $10/1k pages; Read $1.50/1k | Cloud + container | Medium-high |
| **PaddleOCR PP-StructureV3 / PaddleOCR-VL** | Prevent (decoupled layout+recognition) | Yes (JSON incl. cell coords) | Yes | High (paper + repo) | Self-host GPU ops; not turnkey hosted | High (self-host) | Compute only | Apache-2.0; fully local (privacy win) | High if self-hosting acceptable |
| **dots.ocr / dots.mocr** (1.7B) | Prevent (unified layout+recognition+relation) | Yes | Yes (multilingual) | High (paper/repo) | "not yet optimized for high-throughput"; GPU | High (self-host) | Compute only | Open weights | Medium-high |
| **Qwen2.5-VL** | Both (grounding + parse) | Yes (absolute coords, JSON) | Yes | High (tech report) | Small-text boxes less reliable than dedicated OCR | Medium-high (self-host/host) | Compute/host | Open weights | Medium (grouping/grounding) |
| **Gemini 3.x Flash/Pro vision** | Both | Yes (zero-shot boxes) | Yes | Medium-high (docs) | Box precision on dense text unverified for menus | Low (hosted) | 3 Flash $0.50/$3; 3.5 Flash $1.50/$9 per 1M tok | Cloud | Medium (drop-in VLM upgrade) |
| **GPT-4o (current model)** | Neither natively | Weak | Yes | — | Under-reads dense small text (your finding) | Already integrated | $2.50/$10 per 1M tok (legacy) | Cloud | Baseline being replaced |
| **DoorDash-style guardrail (LightGBM)** | Detect | No | N/A | High (eng blog) | Predicts quality, doesn't fix linkage | Medium (train classifier) | Compute trivial | Self-built | High as release gate |
| **Scanbot / Dynamsoft / ML Kit / VisionKit** | Prevent (capture quality) | Quad only | Yes | High (official docs) | No overlap/coverage guidance; page≠tile | Low-medium (RN) | Scanbot/Dynamsoft commercial; ML Kit/VisionKit free | Mostly on-device (privacy win) | High for guided capture |

**GPT-4o pricing (verified).** Current public pricing is **$2.50 per 1M input tokens / $10 per 1M output tokens** (legacy rate; GPT-4.1 replaced it at $2/$8 but does **not** accept image input, so vision workloads stay on GPT-4o). A 2274×1572 menu in high detail is scaled to fit 2048², then shortest side → 768px, and tiled into 512² tiles at 170 tokens each + 85 base. Your ~$0.03/call assumption is roughly consistent with a high-detail image plus a moderate structured-JSON output; the dominant cost is output tokens ($10/1M), so multi-crop strategies multiply cost mainly through repeated large JSON outputs, not image inputs.

**Vendor benchmark caveat.** Mistral states OCR 4 achieved "the top overall score amongst the models we tested on the public OlmOCRBench (85.20)," 93.07 on OmniDocBench, and a 72% average human win rate across "600+ documents in over 12 languages" (mistral.ai/news/ocr-4/). These are vendor-run; one independent write-up (Digital Applied) notes that on the public OlmOCRBench leaderboard (last updated May 21, 2026) OCR 4 "would rank roughly third — not first." Validate on your own fixtures.

### Hypotheses A–D comparison

- **A (Nested-tile prevention):** Supported in principle; cheapest to try. Freeze the 3 clean crops, replace only the overloaded crop with 4 overlapping sub-crops (≥25% overlap), then text-level dedup. Risk: still pure-VLM, so mashups can recur within a sub-crop if still dense. Best as an immediate mitigation, not the end state.
- **B (Spatial/card-ownership verifier):** Strong if backed by *layout-parser* boxes, weak if backed by VLM self-reported boxes on small text. Use as defense-in-depth: reject candidates whose fields don't co-locate in one region box.
- **C (Guided multi-photo capture):** Better reliability/cost/UX than recursive tiling *only if* you avoid pixel stitching. Off-the-shelf guidance primitives exist; coverage/overlap logic is custom.
- **D (Hybrid OCR/layout + VLM):** The most defensible end-state. Now practical via hosted layout parsers (Mistral OCR 4, Document AI, Azure) or self-hosted PP-StructureV3/PaddleOCR-VL. Materially more reliable than pure VLM because the generative step can no longer invent spatially-impossible cards.

### Guided-capture UX analysis

Document mosaicing of one flat page from overlapping photos is a peer-reviewed technique dating to the late 1990s (Zappalá, Gee & Taylor, *Image and Vision Computing*), and is geometrically easiest for a flat menu (low parallax). **But the dominant documented failure mode is directly fatal here:** repeated/uniform text causes false feature matches and wrong homographies, producing "misalignments, distortions and ghosting" — i.e., duplicated content, exactly the release-blocking fake-dish outcome (see "Image Stitching Based on Planar Region Consensus," arXiv 2007.02722, and repeated-pattern stitching literature). Menus (repeated "$", price columns, repeated headers, uniform fonts) are a worst case. OpenCV's Stitcher has an affine/`scans` mode but its own issue tracker shows it failing on text documents even with sufficient overlap.

No mainstream scanner (Office Lens, Adobe Scan, Dropbox, CamScanner) stitches multiple tiles of one page; they treat frames as separate pages (Dropbox's ML blog describes a per-page detect→rectify→enhance pipeline). What *is* off-the-shelf and reliable: real-time position guidance and auto-capture. Scanbot exposes `OK`, `OK_BUT_TOO_SMALL` ("moving the camera closer"), and `OK_BUT_BAD_ANGLES` ("hold the camera directly over the document") statuses; the open-source `react-native-document-scanner` exposes `onRectangleDetect` with `lastDetectionType` (0 = good rectangle, 1 = bad angle, 2 = too far). Dynamsoft offers `MultiFrameResultCrossFilter` cross-frame verification. Quality gating + re-shoot prompts are standard (Scanbot Document Quality Analyzer rates "very poor" to "excellent" and prompts retake; blur detection via Laplacian variance; IEEE papers and patents 11,516,383 / 10,708,491 on region-level rescan). Gaps: no SDK offers tile-coverage guidance for one page; no formal "cut-off-edge" detection method exists as a named research contribution; no rigorous UX-burden study for guided multi-shot vs single-shot of a dense document.

**Recommended guided-capture design (inference):** guide the user to capture 3–4 *distinct, mostly non-overlapping regions*, each as a full sub-document with (a) coverage guidance so section edges are not clipped, (b) per-region quality gating (reject blur/glare, prompt re-shoot), and (c) merge at the **structured-data level**, deduping by (name + price + section) — never by pixel stitching. This preserves recall (edge items captured deliberately) while avoiding the stitching duplicate-generator.

## Recommendations

**Immediate pre-release (cheapest, no new infra):**
1. Keep the three clean 2×2 parent crops; replace only the overloaded crop with 4 overlapping sub-crops (≥25% overlap). Dedup at text level by (name+price+section).
2. Add a hosted **layout-parser provenance check** on the overloaded region: run Mistral OCR 4 (or Document AI Layout) to get region boxes + words, and **reject any candidate whose name+price+description do not co-locate in one region box.** This is prevention-adjacent detection that specifically kills mashups (which your name-only verifier cannot, because the words are genuinely printed).

**Optional defense-in-depth:**
3. A DoorDash-style confidence gate (lightweight classifier or rule set on box-coverage + confidence) that, below threshold, flags the *specific card* for in-app user confirmation rather than deleting it. Never auto-delete.
4. Guided-capture pilot (region-based, not stitched) using an RN scanner SDK (Scanbot/Dynamsoft commercial; ML Kit/VisionKit free) for quality gating and position guidance.

**Post-release / data-dependent (end state):**
5. Migrate the overloaded path to the **hybrid layout-first architecture (Hypothesis D):** layout parser → region boxes/tokens → VLM groups bounded tokens into cards. This attacks the root cause and reduces reliance on multi-crop heuristics. Prefer Mistral OCR 4 (hosted, cheap, self-host option) or self-hosted PaddleOCR-VL/PP-StructureV3 if data residency matters. Both are callable from a Supabase Edge Function as an HTTP step before the LLM grouping call.

**Thresholds that change the recommendation:** If the layout-parser co-location check drops fakes to zero on your 5 known-fake fixtures while preserving all real/size-variant controls, promote it from detection to the primary gate. If nested sub-tiling alone eliminates the mashups on the star fixture, defer the hybrid migration. If guided region capture raises abandonment materially in a pilot, keep single-photo + hybrid parsing.

## Three decisive experiments (cheapest → most expensive)

**Experiment 1 — Nested sub-tiling of only the overloaded crop.**
- *Hypothesis:* Splitting only the overloaded crop into 4 overlapping sub-crops (≥25% overlap) eliminates cross-card mashups without losing sections.
- *Single changed variable:* the overloaded crop's tiling (1 tile → 4 overlapping sub-tiles). Freeze the 3 clean parent crops and the prompt.
- *Inputs:* the star fixture (2274×1572, ~40 cards) plus your 5 known-fake and 3 real/size-variant control cases.
- *Outputs/traces:* per-sub-crop raw JSON, pre-dedup candidate list, post-dedup list, and the mapping of each final candidate to the sub-crop(s) it came from.
- *Controls:* current 2×2 geometry as baseline; same dedup logic on both.
- *Success gate:* all 5 known fakes disappear AND all real/size-variant controls survive AND section coverage ≥ current. *Rejection gate:* any real dish lost, or a new mashup appears within a sub-crop.
- *Cost:* ~2–3 extra GPT-4o vision calls per menu (~$0.05–$0.10/menu at current pricing). Decision it enables: whether density reduction alone is sufficient short-term.

**Experiment 2 — Layout-parser co-location verifier.**
- *Hypothesis:* Requiring name+price+description to co-locate within one region box from a layout parser rejects mashups that name-only verification misses, without deleting real dishes.
- *Single changed variable:* add one hosted layout-parser pass (Mistral OCR 4 or Document AI Layout) + a geometric co-location filter after extraction.
- *Inputs:* same fixture set as Exp. 1.
- *Outputs/traces:* region boxes + words with coordinates; for each candidate, the box IDs its fields map to and the accept/reject decision with geometry.
- *Controls:* extraction without the filter; the 3 real/size-variant controls must pass.
- *Success gate:* ≥4/5 known fakes rejected AND 3/3 controls preserved. *Rejection gate:* any control rejected, or fakes pass because fields map to adjacent boxes (would require tightening adjacency tolerance).
- *Cost:* Mistral OCR 4 at $2–4 per 1,000 pages ≈ <$0.005/menu, plus GPT grouping. Decision it enables: promote co-location to the primary release gate vs. keep as advisory flag.

**Experiment 3 — Full hybrid layout-first pipeline vs. pure VLM.**
- *Hypothesis:* Layout parser → bounded tokens → VLM grouping yields higher precision AND recall than the current multi-crop pure-VLM pipeline on dense menus.
- *Single changed variable:* replace the generative extraction step with token-grouping over layout-parser output (hold capture + fixtures constant).
- *Inputs:* a labeled set of 20–30 dense ES/EN menus (hand-annotated ground truth of every card and its fields), including the star fixture and controls.
- *Outputs/traces:* per-card precision/recall, count of invented cards (must be 0), count of dropped real cards, and field-attribution accuracy; full token→card grouping traces.
- *Controls:* current pipeline scored on the same labeled set.
- *Success gate:* zero invented cards across the set AND recall ≥ current pipeline AND field-attribution accuracy materially higher. *Rejection gate:* any invented card, or recall regression.
- *Cost:* highest — annotation labor (small, ~20–30 menus) + layout-parser + LLM calls (~$0.01–0.02/menu) + engineering. Decision it enables: whether to commit the architecture migration.

## Failure modes and safety risks

- **Precision "improvements" that silently delete real dishes.** Your history already shows aggressive verification and post-merge whole-list verification removed real items, and run-consistency lets stable fakes survive. Any new verifier must be **spatially grounded** (co-location evidence), auditable per-card, and default to *flag-for-confirmation*, not deletion.
- **Pixel stitching duplicates.** Repeated menu text → false matches → ghosted/duplicated cards. Avoid; merge at the data level.
- **VLM self-reported boxes on small text** are unreliable; back the co-location check with a dedicated OCR/layout parser's boxes.
- **Count-tolerance masking.** Accepting counts within a band hides both a deleted real dish and an invented fake that offset each other. Do not treat count bands as a correctness signal — this is "hiding," not detection or prevention.
- **Vendor benchmark claims** (e.g., Mistral OCR 4's 85.20 OlmOCRBench, 72% human-preference) are vendor-stated and not menu-specific; validate on your own fixtures before trusting.

## Caveats
- Much pricing/capability data comes from vendor pages and secondary aggregators; treat benchmark numbers as directional and re-verify on official pricing pages (mistral.ai, cloud.google.com/document-ai/pricing, azure.microsoft.com, developers.openai.com/api/docs/pricing) before budgeting.
- No source provides a menu-specific optimal tile-overlap ratio or a quantified guided-multi-shot UX study; those recommendations are engineering inference from adjacent evidence, labeled as such.
- The "not solved" conclusion is a judgment from the absence of any published zero-recombination guarantee plus the consistent industry move to decoupled layout-first architectures.
- The ~16,384-image-token figure sometimes attributed to Qwen2.5-VL actually belongs to Kwai Keye-VL (arXiv 2507.01949); Qwen2.5-VL's documented default is 256–1280 tokens per image.