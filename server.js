import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("Sci-Guru backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

function buildInstructions(mode) {
  const base = `
You are Sci-Guru — a Zimbabwe-focused science tutor aligned to ZIMSEC / Heritage-Based Curriculum (Forms 1–4).
Use simple language, correct science, and Zimbabwean/local examples when helpful.
Format clearly with headings and bullet points.
Do NOT copy copyrighted textbooks or past papers verbatim. Create original content in a similar style.
Always include safety notes for lab-related topics.
`;

  if (mode === "Notes") {
    return base + `
Create structured NOTES with:
- Key definitions
- Key points
- Simple examples (include Zimbabwe context where useful)
- Common mistakes/misconceptions
- 3 quick check questions with answers
`;
  }

  if (mode === "Worked Examples") {
    return base + `
Create 3–5 WORKED EXAMPLES appropriate to the topic.
Each example must show:
- Question
- Step-by-step working
- Final answer
Use numbers/units correctly and explain the steps simply.
End with 2 practice questions (no working, answers only).
`;
  }

  if (mode === "Past Exam Questions") {
    return base + `
Create ORIGINAL exam-style questions (do not reproduce real past papers).
Provide:
- 10 questions total
- Mix: multiple choice, short structured, and calculation where relevant
- Indicate marks per question
- Provide answers at the end (brief)
`;
  }

  if (mode === "Marking Scheme") {
    return base + `
Create a MARKING SCHEME / MEMO for exam-style questions.
If no questions are provided by the user, first generate 6–8 original exam-style questions (with marks),
then provide a detailed marking scheme with:
- Key points required
- Mark allocation per step
- Common acceptable alternatives
`;
  }

  if (mode === "Quiz") {
    return base + `
Generate a quiz of 10 questions with answers.
Mix: multiple choice, short answer, and calculation (if relevant).
Add a short marking guide at the end.
`;
  }

  if (mode === "Practical") {
    return base + `
Write a practical guide with:
Aim, Apparatus, Method (steps), Results/Observations, Conclusion, Safety, Common mistakes.
Keep it suitable for a school laboratory.
Avoid dangerous instructions.
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

app.post("/api/tutor", async (req, res) => {
  try {
    const {
      mode = "Notes",
      form = "Form 1",
      chapter = "",
      topic = "General",
      question = ""
    } = req.body || {};

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const instructions = buildInstructions(mode);

    const input = [
      `Mode: ${mode}`,
      `Form: ${form}`,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `Extra instruction from user: ${question || "(none)"}`
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sci-Guru API running on port ${port}`));
