import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

type Handler = (request: Request) => Promise<Response>;

Deno.test("enrich response reports the pinned Stage-2 model", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "test-key");
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: {
        content: JSON.stringify({
          items: [{
            name: "A",
            description: "",
            price: null,
            category: "main",
            ingredients: [],
            protein_g: 1,
            carb_g: 1,
            fat_g: 1,
            estimated_calories: 10,
            confidence: "high",
            allergens: [],
          }],
        }),
      },
    }],
  }));

  try {
    const { handleRequest } = await import(`./index.ts?handler-test=${crypto.randomUUID()}`) as {
      handleRequest: Handler;
    };
    const response = await handleRequest(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        provider: "gpt-4o",
        stage: "enrich",
        items: [{ name: "A", description: "", price: null, category: "main" }],
      }),
    }));

    assertEquals((await response.json()).model_id, "gpt-4o-2024-08-06");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("OPENAI_API_KEY");
    else Deno.env.set("OPENAI_API_KEY", originalKey);
  }
});
