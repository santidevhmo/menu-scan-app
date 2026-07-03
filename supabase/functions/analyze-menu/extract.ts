const MODEL_TIMEOUT_MS = 120000;
const EXTRACT_SEED = 17;

export const EXTRACT_PROMPT = `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category (appetizer|main|side|dessert|drink|other).
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
If a description is not printed, use an empty string. If a price is not printed, set it to null.`;

export const EXTRACT_SCHEMA = {
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
          category: {
            type: "string",
            enum: ["appetizer", "main", "side", "dessert", "drink", "other"],
          },
        },
        required: ["name", "description", "price", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export async function runExtraction(
  photos: string[],
  apiKey: string,
): Promise<{ items: unknown[]; raw_response: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACT_PROMPT },
            ...photos.map((photo) => ({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${photo}` },
            })),
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "menu_items",
            strict: true,
            schema: EXTRACT_SCHEMA,
          },
        },
        temperature: 0,
        seed: EXTRACT_SEED,
      }),
      signal: controller.signal,
    });
    const json = await res.json() as {
      error?: { message?: string };
      choices?: { finish_reason: string; message: { content: string } }[];
    };
    if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");

    const text = json.choices?.[0]?.message.content;
    if (!text) throw new Error("OpenAI returned no extraction content");

    console.log("[openai] finish_reason:", json.choices?.[0]?.finish_reason);
    return {
      items: (JSON.parse(text) as { items: unknown[] }).items,
      raw_response: text,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Model request timed out after ${MODEL_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
