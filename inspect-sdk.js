const AnthropicSDK = require("@anthropic-ai/sdk");
console.log("SDK Keys:", Object.keys(AnthropicSDK));
console.log("Default type:", typeof AnthropicSDK.default);
if (AnthropicSDK.default) {
  console.log("Default Keys:", Object.keys(AnthropicSDK.default));
}
console.log("Anthropic type:", typeof AnthropicSDK.Anthropic);
if (AnthropicSDK.Anthropic) {
    try {
        new AnthropicSDK.Anthropic({ apiKey: "test" });
        console.log("Anthropic is a constructor");
    } catch (e) {
        console.log("Anthropic is NOT a constructor", e.message);
    }
}
if (AnthropicSDK.default && AnthropicSDK.default.Anthropic) {
    try {
        new AnthropicSDK.default.Anthropic({ apiKey: "test" });
        console.log("AnthropicSDK.default.Anthropic is a constructor");
    } catch (e) {
        console.log("AnthropicSDK.default.Anthropic is NOT a constructor");
    }
}
