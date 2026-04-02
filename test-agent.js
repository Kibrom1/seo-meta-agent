async function test() {
  try {
    console.log("Starting dynamic import test...");
    const sdk = await import("@anthropic-ai/sdk");
    console.log("SDK Keys:", Object.keys(sdk));
    const Anthropic = sdk.Anthropic || sdk.default?.Anthropic || sdk.default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "test" });
    console.log("Successfully instantiated Anthropic via dynamic import");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
