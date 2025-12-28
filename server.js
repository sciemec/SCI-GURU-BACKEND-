require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const axios = require("axios"); // Added for the self-ping wake-up feature

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ Whitelist for GitHub Pages and Local Development
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_ORIGIN, 
  "https://sciemec.github.io", 
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

// ---------- Middleware ----------
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      console.error("CORS Blocked Origin:", origin);
      return cb(new Error("CORS blocked: " + origin), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

// ---------- Self-Ping Logic (Prevent Render Sleep) ----------
// This pings your health route every 14 minutes to keep the server awake.
const BACKEND_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}.onrender.com/api/health`;

setInterval(async () => {
  try {
    if (process.env.RENDER_EXTERNAL_HOSTNAME) {
      await axios.get(BACKEND_URL);
      console.log("Self-ping successful: Server is staying awake.");
    }
  } catch (err) {
    console.error("Self-ping failed:", err.message);
  }
}, 840000); // 14 minutes

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.send("Sci-Guru Backend is running ✅");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy", timestamp: new Date() });
});

function buildInstructions(actionOrMode = "chat") {
  const a = String(actionOrMode || "").toLowerCase();

  const base = 
    "You are Sci-Guru, a friendly Zimbabwean Combined Science tutor aligned to ZIMSEC/Heritage-Based curriculum (Forms 1–4). " +
    "Explain concepts clearly using local examples (e.g., maize meal, borehole water, cooking fire, Eastern Highlands). " +
    "Always use clear headings and bullet points. Do not reproduce copyrighted textbook questions exactly; create original 'exam-style' ones.";

  if (a.includes("quiz")) {
    return base + "\nGenerate a 10-question ZIMSEC-style Multiple Choice Quiz. Provide an ANSWER KEY at the very end.";
  }
  if (a.includes("practical")) {
    return base + "\nGenerate a school practical with: Aim, Apparatus, Method, Results/Observations, Conclusion, and a 'Chenjedzo/Safety' section.";
  }
  if (a.includes("notes")) {
    return base + "\nCreate structured study notes with key definitions, main points, and 2 quick-check questions.";
  }
  return base;
}

// ---------- Main AI Route ----------
app.post("/api/chat", async (req, res, next) => { // added 'next' for error handling
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
      return res.status(400).json({ text: "Please send a question or topic." });
    }

    const instructions = buildInstructions(action || mode);
    const input = [
      `Mode: ${mode}`,
      form ? `Form: ${form}` : null,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `User request: ${userText}`,
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input },
      ],
      temperature: 0.7,
    });

    res.json({ text: completion?.choices?.[0]?.message?.content?.trim() || "No output returned." });
  } catch (err) {
    // Pass the error to the global error handler below
    next(err);
  }
});

// ---------- Global Error Handler ----------
// This catches any crash and sends a clean message to the student
app.use((err, req, res, next) => {
  console.error("🔥 SYSTEM ERROR:", err.stack);
  
  const status = err.status || 500;
  res.status(status).json({
    error: true,
    message: "Sci-Guru backend error.",
    suggestion: "Wait 60 seconds and try again (the server might be waking up).",
    debug_detail: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Sci-Guru backend listening on port ${PORT}`);
});
