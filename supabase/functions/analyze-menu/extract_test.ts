import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { runExtraction } from "./extract.ts";

Deno.test("runExtraction sends photos to GPT-4o and returns parsed items", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    authorization = request.headers.get("Authorization") ?? "";
    requestBody = JSON.parse(await request.text());
    return new Response(
      JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: { content: '{"items":[]}' },
        }],
      }),
    );
  }) as typeof fetch;

  try {
    const result = await runExtraction(["photo-base64"], "test-key");

    assertEquals(authorization, "Bearer test-key");
    assertEquals(requestBody.model, "gpt-4o");
    assertEquals(result, { items: [], raw_response: '{"items":[]}' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
