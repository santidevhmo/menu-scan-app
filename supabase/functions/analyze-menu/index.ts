import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
// const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!; // TODO: re-enable when OpenAI billing is set up (add payment method + $5 credits at platform.openai.com/settings/billing)
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;

const MENU_ITEM_SCHEMA_GEMINI = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      price: { type: "number", nullable: true },
      category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
      estimated_calories: { type: "number" },
      protein_g: { type: "number" },
      carbs_g: { type: "number" },
      fat_g: { type: "number" },
      dietary_tags: { type: "array", items: { type: "string" } },
      allergens: { type: "array", items: { type: "string" } },
    },
    required: ["name", "description", "price", "category", "estimated_calories", "protein_g", "carbs_g", "fat_g", "dietary_tags", "allergens"],
  },
};

// TODO: re-enable MENU_ITEM_SCHEMA_OPENAI when OpenAI billing is set up (add payment method + $5 credits at platform.openai.com/settings/billing)
// const MENU_ITEM_SCHEMA_OPENAI = {
//   type: "object",
//   properties: {
//     items: {
//       type: "array",
//       items: {
//         type: "object",
//         properties: {
//           name: { type: "string" },
//           description: { type: "string" },
//           price: { type: ["number", "null"] },
//           category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
//           estimated_calories: { type: "number" },
//           protein_g: { type: "number" },
//           carbs_g: { type: "number" },
//           fat_g: { type: "number" },
//           dietary_tags: { type: "array", items: { type: "string" } },
//           allergens: { type: "array", items: { type: "string" } },
//         },
//         required: ["name", "description", "price", "category", "estimated_calories", "protein_g", "carbs_g", "fat_g", "dietary_tags", "allergens"],
//         additionalProperties: false,
//       },
//     },
//   },
//   required: ["items"],
//   additionalProperties: false,
// };

// Mistral uses the same JSON schema format as OpenAI — keeping a live copy for callMistralOCR
const MENU_ITEM_SCHEMA_MISTRAL = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
          estimated_calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          dietary_tags: { type: "array", items: { type: "string" } },
          allergens: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "price", "category", "estimated_calories", "protein_g", "carbs_g", "fat_g", "dietary_tags", "allergens"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function buildPrompt(goals: string[]): string {
  return `You are analyzing restaurant menu photos. Extract every menu item visible.
For each item, estimate its nutritional content based on typical restaurant portions.
Sort the results by: ${goals.join(", ")}.
If a price is not visible, set it to null.
For category, pick the closest match from: appetizer, main, side, dessert, drink, other.`;
}

async function callGemini(photos: string[], goals: string[], model: string) {
  const parts = [
    { text: buildPrompt(goals) },
    ...photos.map((b64) => ({
      inlineData: { mimeType: "image/jpeg", data: b64 },
    })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: MENU_ITEM_SCHEMA_GEMINI,
        },
      }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Gemini API error");
  const text = json.candidates[0].content.parts[0].text;
  return { items: JSON.parse(text), raw_response: text };
}

// TODO: re-enable callOpenAI when OpenAI billing is set up (add payment method + $5 credits at platform.openai.com/settings/billing)
// async function callOpenAI(photos: string[], goals: string[]) {
//   const imageContent = photos.map((b64) => ({
//     type: "image_url" as const,
//     image_url: { url: `data:image/jpeg;base64,${b64}` },
//   }));
//   const res = await fetch("https://api.openai.com/v1/chat/completions", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
//     body: JSON.stringify({
//       model: "gpt-4o",
//       messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(goals) }, ...imageContent] }],
//       response_format: { type: "json_schema", json_schema: { name: "menu_items", strict: true, schema: MENU_ITEM_SCHEMA_OPENAI } },
//     }),
//   });
//   const json = await res.json();
//   if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
//   return JSON.parse(json.choices[0].message.content).items;
// }

async function callMistralOCR(photos: string[], goals: string[]) {
  // Step 1: OCR extraction
  const ocrResults: string[] = [];
  for (const b64 of photos) {
    const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          image_url: `data:image/jpeg;base64,${b64}`,
        },
      }),
    });
    const ocrJson = await ocrRes.json();
    if (!ocrRes.ok) throw new Error(ocrJson.message ?? "Mistral OCR error");
    const pageTexts = ocrJson.pages.map((p: { markdown: string }) => p.markdown);
    ocrResults.push(pageTexts.join("\n"));
  }

  // Step 2: Structure the extracted text via chat with JSON schema
  const structureRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        {
          role: "user",
          content: `${buildPrompt(goals)}\n\nHere is the menu text extracted via OCR:\n\n${ocrResults.join("\n---\n")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "menu_items",
          strict: true,
          schema: MENU_ITEM_SCHEMA_MISTRAL,
        },
      },
    }),
  });

  const rawOcrText = ocrResults.join("\n---\n");

  const structureJson = await structureRes.json();
  if (!structureRes.ok) throw new Error(structureJson.message ?? "Mistral chat error");
  const parsed = JSON.parse(structureJson.choices[0].message.content);
  return { items: parsed.items, raw_response: rawOcrText };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { photos, goals, provider } = await req.json();
    const start = Date.now();

    let items;
    let modelId: string;
    let rawResponse: string | undefined;

    switch (provider) {
      case "gemini-2.5-flash": {
        const result = await callGemini(photos, goals, "gemini-2.5-flash");
        items = result.items;
        rawResponse = result.raw_response;
        modelId = "gemini-2.5-flash";
        break;
      }
      case "gemini-2.5-pro": {
        const result = await callGemini(photos, goals, "gemini-2.5-pro");
        items = result.items;
        rawResponse = result.raw_response;
        modelId = "gemini-2.5-pro";
        break;
      }
      // TODO: re-enable when OpenAI billing is set up (add payment method + $5 credits at platform.openai.com/settings/billing)
      // case "gpt-4o":
      //   items = await callOpenAI(photos, goals);
      //   modelId = "gpt-4o";
      //   break;
      case "mistral-ocr": {
        const result = await callMistralOCR(photos, goals);
        items = result.items;
        rawResponse = result.raw_response;
        modelId = "mistral-ocr-latest + mistral-large-latest";
        break;
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return new Response(
      JSON.stringify({ items, raw_response: rawResponse, latency_ms: Date.now() - start, model_id: modelId }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        items: [],
        latency_ms: 0,
        model_id: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
