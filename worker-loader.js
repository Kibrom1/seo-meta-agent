const jiti = require("jiti")(__filename, {
  alias: {
    "@": __dirname
  }
});

try {
  console.log("[loader] Attempting to load test-agent.js...");
  jiti("./test-agent.js");
} catch (err) {
  console.error("[loader] Critical error during test execution:");
  console.error(err);
  process.exit(1);
}
