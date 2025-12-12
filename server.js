import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("Sci-Guru backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

function buildInstructions(mode) {
  const base = `
You are Sci-Guru — a Zimbabwe-focused science tutor aligned to ZIMSEC / Heritage-Based Curriculum (Forms 1–4).
Use simple language, correct science, and Zimbabwean/local examples when helpful.
Format clearly with headings and bullet points.
Always be safe (lab safety, no dangerous instructions).
`;
  if (mode === "Quiz") return base + `Generate 10 questions + answers + short marking guide.`;
  if (mode === "Practical") return base + `Write: Aim, Apparatus, Method, Observations, Conclusion, Safety, Common mistakes.`;
  return base + `Explain with: definition, key points, local examples, then 3 quick check Q&As.`;
}

app.post("/api/tutor", async (req, res) => {
  try {
    const { mode = "Explain", form = "Form 1", topic = "General", question = "" } = req.body || {};
    if (!question.trim()) return res.status(400).json({ error: "Please type a question." });

    const model = process.env.OPENAI_MODEL || "gpt-5";
    const instructions = buildInstructions(mode);
    const input = `Form: ${form}\nTopic: ${topic}\nUser question: ${question}`;

    const response = await client.responses.create({ model, instructions, input });
    res.json({ text: response.output_text || "No output returned." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error calling OpenAI.", detail: err?.message || String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sci-Guru API running on port ${port}`));
