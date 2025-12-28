// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ FIXED: Added your GitHub Pages URL to the whitelist
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_ORIGIN, // optional: set in Render env
  "https://sciemec.github.io",  // Your live frontend
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

// ---------- Middleware ----------
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: function (origin, cb) {
      // 1. Allow server-to-server, curl, Postman (no origin)
      if (!origin) return cb(null, true);

      // 2. Check if the origin is in our allowed list
      if (ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      } else {
        // 3. If not found, log it and block
        console.error("CORS Blocked Origin:", origin);
        return cb(new Error("CORS blocked: " + origin), false);
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.send("Sci-Guru Backend is running ✅");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy" });
});

function buildInstructions(actionOrMode = "chat") {
  const a = String(actionOrMode || "").toLowerCase();

  const base =
    "You are Sci-Guru, a friendly Zimbabwean Combined Science tutor aligned to ZIMSEC/Heritage-Based curriculum. " +
    "Explain clearly, step-by-step, using local examples (maize meal, borehole water, imbokodo, cooking fire, etc). " +
    "Keep it safe and school-appropriate. If asked for a practical, include safety precautions.";

  if (a.includes("quiz")) {
    return (
      base +
      "\nReturn a 10-question multiple-choice quiz (A–D). After the quiz, add an ANSWER KEY."
    );
  }
  if (a.includes("practical")) {
    return (
      base +
      "\nReturn a school practical with: Aim, Apparatus, Chemicals (if any), Method, Results table, Safety, Conclusion."
    );
  }
  if (a.includes("explain")) {
    return base + "\nReturn a clear explanation with examples and a short summary at the end.";
  }
  return base;
}

// ✅ Main AI route
app.post("/api/chat", async (req, res) => {
  try {
    const {
      mode = "Tutor",
      form = "",
      chapter = "",
      topic = "General",
      question = "",
      message = "",
      action = "chat",
    } = req.body || {};

    const userText = (question || message || "").trim();

    if (!userText) {
      return res.status(400).json({ text: "Please send a question/message." });
    }

    const instructions = buildInstructions(action || mode);

    const input = [
      `Mode: ${mode}`,
      form ? `Form: ${form}` : null,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `User request: ${userText}`,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input },
      ],
      temperature: 0.7,
    });

    const text =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "No output returned.";

    res.json({ text });
  } catch (err) {
    console.error("OpenAI Error:", err);
    res.status(500).json({
      error: "Server error calling OpenAI.",
      detail: err?.message || String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Sci-Guru backend listening on port ${PORT}`);
});
