import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// ===== CORS (frontend allowed) =====
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(
  cors({
    origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

// ===== OpenAI Client =====
if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is missing. Set it in Render Environment Variables.");
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== Health endpoints =====
app.get("/", (req, res) => res.send("Sci-Guru backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ===== Prompt instructions =====
function buildInstructions(mode) {
  const base = `
You are Sci-Guru — a Zimbabwe-focused science tutor aligned to ZIMSEC / Heritage-Based Curriculum (Forms 1–4).
Use simple language, correct science, and Zimbabwean/local examples when helpful.
Format clearly with headings and bullet points.
Always be safe (lab safety; do not give dangerous step-by-step instructions).
`;

  if (mode === "Quiz") {
    return base + `
Create a quiz of 10 questions with answers.
Mix: multiple choice, short answer, and calculation (if relevant).
Add a short marking guide at the end.
`;
  }

  if (mode === "Practical") {
    return base + `
Write a practical guide with:
Aim, Apparatus, Method (steps), Results/Observations, Conclusion, Safety, Common mistakes.
Keep it suitable for a school laboratory.
`;
  }

  return base + `
Explain clearly using:
1) Definition
2) Key points
3) 2–3 Zimbabwe/local examples
4) Quick check: 3 short questions WITH answers
`;
}

// ===== Main API =====
app.post("/api/tutor", async (req, res) => {
  try {
    const {
      mode = "Explain",
      form = "Form 1",
      chapter = "",
      topic = "General",
      question = ""
    } = req.body || {};

    if (!question.trim()) {
      return res.status(400).json({ error: "Please type a question." });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // you can set gpt-5 in Render env
    const instructions = buildInstructions(mode);

    const input = [
      `Form: ${form}`,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `User question: ${question}`
    ].filter(Boolean).join("\n");

    const response = await client.responses.create({
      model,
      instructions,
      input
    });

    res.json({ text: response.output_text || "No output returned." });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error calling OpenAI.",
      detail: err?.message || String(err)
    });
  }
});

// ===== Start server =====
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sci-Guru API running on port ${port}`));
