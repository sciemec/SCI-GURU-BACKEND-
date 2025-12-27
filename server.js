/**
 * Sci-Guru Backend (Render) — server.js
 * - POST /api/chat  (main)
 * - GET  /api/health
 * - CORS enabled for GitHub Pages
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Set this on Render as: https://YOURNAME.github.io,https://YOURNAME.github.io/REPO
// If you leave it blank, it will allow all origins (ok for testing).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------- MIDDLEWARE ----------
app.use(express.json({ limit: "2mb" }));

app.use(
  cors({
    origin: function (origin, cb) {
      // Allow requests with no origin (Postman/curl/Render health checks)
      if (!origin) return cb(null, true);

      // If no whitelist configured, allow all (best for quick debugging)
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);

      // Otherwise allow only whitelisted origins
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      return cb(new Error("CORS blocked: " + origin), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// (Optional) If some browsers send OPTIONS preflight, this helps:
app.options("*", cors());

// ---------- ROUTES ----------
app.get("/", (req, res) => {
  res.status(200).send("Sci-Guru backend is running ✅");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "online",
    model: OPENAI_MODEL,
    time: new Date().toISOString(),
  });
});

// Build instructions depending on action/mode
function buildInstructions(mode = "Notes", action = "") {
  const base = `
You are Sci-Guru, a Zimbabwe ZIMSEC / Heritage-Based Combined Science tutor.
Be clear, step-by-step, and age-appropriate.
Use Zimbabwean examples when helpful (maize meal, borehole water, Sadza, grinding stone/imbokodo, etc.).
If the user asks for a practical, include: Aim, Apparatus, Chemicals (if any), Method, Results table, Safety, Conclusion.
Keep answers structured with headings and bullet points.
`;

  if (action === "quiz") {
    return base + `
Generate a quiz that matches the selected form/topic.
Prefer multiple-choice (A–D). Provide answers at the end.`;
  }

  if (action === "practical") {
    return base + `
Generate a safe school practical experiment with the standard sections (Aim, Apparatus, Method, etc.).
Use local low-cost materials where possible.`;
  }

  if (action === "explain") {
    return base + `
Explain simply, like a teacher, then give 3 quick check questions at the end.`;
  }

  // Default chat/notes
  return base + `
Mode is "${mode}". Respond appropriately for that mode.`;
}

// MAIN CHAT ROUTE (matches your tutor.html)
app.post("/api/chat", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY on server environment variables.",
      });
    }

    const body = req.body || {};

    // Support both frontend payload formats:
    // - your tutor.html uses message
    // - other tutor uses question
    const mode = body.mode || "Tutor";
    const action = body.action || ""; // explain | quiz | practical | chat
    const topic = body.topic || "General";
    const form = body.form || "";      // optional if you send it
    const chapter = body.chapter || ""; // optional
    const message = body.message || body.question || body.prompt || "";

    if (!message.trim()) {
      return res.status(400).json({ error: "No message/question provided." });
    }

    const instructions = buildInstructions(mode, action);

    const input = [
      form ? `Form: ${form}` : null,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `User request: ${message}`
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      temperature: 0.7,
    });

    const text =
      completion?.choices?.[0]?.message?.content ||
      "No output returned.";

    // Return BOTH keys so any frontend works:
    res.json({ text, reply: text });

  } catch (err) {
    console.error("OpenAI Error:", err);
    res.status(500).json({
      error: "Server error calling OpenAI.",
      detail: err?.message || String(err),
    });
  }
});

// OPTIONAL ALIASES (your tutor tries multiple endpoints)
app.post("/chat", (req, res) => app._router.handle(req, res, () => {}));
app.post("/api/ask", (req, res) => app._router.handle(req, res, () => {}));
app.post("/ask", (req, res) => app._router.handle(req, res, () => {}));

// Better alias handling (maps to /api/chat)
app.post("/chat", (req, res) => { req.url = "/api/chat"; app.handle(req, res); });
app.post("/api/ask", (req, res) => { req.url = "/api/chat"; app.handle(req, res); });
app.post("/ask", (req, res) => { req.url = "/api/chat"; app.handle(req, res); });

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Sci-Guru backend listening on port ${PORT}`);
});
