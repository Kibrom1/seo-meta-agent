import "dotenv/config";
import { encryptApiKey } from "./lib/crypto.js";
import { createServiceClient } from "./lib/db.js";

async function createTestProject() {
  const userId = "8d3e25ea-dce2-4712-bc87-d18c8b3f43b9"; // From npx supabase db query
  const secret = "test-secret-123";
  const encryptedSecret = encryptApiKey(secret);
  
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("projects").insert({
    user_id: userId,
    brand_name: "Aelaf Visuals",
    cms_type: "Contentful",
    api_key_enc: encryptedSecret, // dummy
    webhook_secret: encryptedSecret,
    tone_guidelines: "Professional and technical",
    token_limit: 100000
  }).select("id").single();

  if (error) {
    console.error("Error creating project:", error);
    process.exit(1);
  }

  console.log(data.id);
}

createTestProject();
