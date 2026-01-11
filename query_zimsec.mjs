import OpenAI from "openai";
import "dotenv/config";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.log('Usage: node scripts/query.mjs "Your question here"');
  process.exit(0);
}

if (!process.env.VECTOR_STORE_ID) {
  console.error("Missing VECTOR_STORE_ID in .env. Run: npm run setup:vs");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  defaultHeaders: { "OpenAI-Beta": "assistants=v2" }
});

const res = await openai.responses.create({
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  input: `Answer using ONLY the information in my uploaded PDFs. If the PDFs do not contain the answer, say: "I cannot find that in the PDFs." \n\nQuestion: ${question}`,
  tools: [
    {
      type: "file_search",
      vector_store_ids: [process.env.VECTOR_STORE_ID]
    }
  ]
});

console.log("\nANSWER:\n");
console.log(res.output_text || JSON.stringify(res, null, 2));