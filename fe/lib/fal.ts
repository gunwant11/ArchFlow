import { fal } from "@fal-ai/client";

// Configure fal.ai client with API key from environment variables
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || "",
});

export { fal };

