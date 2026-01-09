require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const admin = require('firebase-admin');
const { Paynow } = require('paynow');
const axios = require('axios');

const app = express();

// --- 1. CONFIG & SECURITY ---
const allowedOrigins = ['https://sci-guru-ai', 'www.sci-guru-ai.com', 'http://sci-guru-49796.web.app',http://localhost:500'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS blocked by Sci-Guru Security'));
    }
}));
app.use(express.json({ limit: "25mb" })); // High limit for Vision homework photos

// Paths & Models for RAG
const VEC_PATH = path.resolve(process.cwd(), "docs/zimsec_vectors.json");
const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // Using 4o for Vision + RAG
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// --- 2. INITIALIZE SERVICES ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Firebase (Nudges & Auth)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Paynow (EcoCash)
const paynow = new Paynow(process.env.PAYNOW_ID, process.env.PAYNOW_KEY);
paynow.resultUrl = "https://sci-guru-backend.onrender.com/api/payment-update";

// --- 3. HELPER FUNCTIONS (RAG Logic) ---
function cosineSimilarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function loadVectors() {
    if (!fs.existsSync(VEC_PATH)) return null;
    return JSON.parse(fs.readFileSync(VEC_PATH, "utf8"));
}

// --- 4. ROUTES ---

// Health Check
app.get("/health", (req, res) => {
    res.json({ 
        ok: true, 
        model: CHAT_MODEL, 
        vectors_loaded: fs.existsSync(VEC_PATH),
        zimsec_status: "Active 🇿🇼" 
    });
});

// A. MASTER CHAT (RAG + Student Memory)
app.post("/chat", async (req, res) => {
    try {
        const message = (req.body?.message || "").toString().trim();
        const history = req.body?.history || [];
        if (!message) return res.status(400).json({ error: "message is required" });

        const store = loadVectors();
        let context = "No specific ZIMSEC context found.";
        let topChunks = [];

        if (store) {
            // Embed question for Vector Search
            const qEmbed = await openai.embeddings.create({ model: EMBED_MODEL, input: message });
            const qVec = qEmbed.data[0].embedding;

            // Rank chunks from PDF
            const scored = store.chunks.map(c => ({
                id: c.id, text: c.text, score: cosineSimilarity(qVec, c.embedding)
            })).sort((a, b) => b.score - a.score);

            topChunks = scored.slice(0, 5);
            context = topChunks.map((t, i) => `(${i + 1}) ${t.text}`).join("\n\n");
        }

        const system = `You are Sci-Guru, a Zimbabwe ZIMSEC Combined Science tutor. 
        Use the ZIMSEC CONTEXT provided to answer. If context is missing, use local Zimbabwean Heritage examples.`;

        const userPrompt = `ZIMSEC CONTEXT:\n${context}\n\nQUESTION:\n${message}`;

        const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                { role: "system", content: system },
                ...history,
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3
        });

        res.json({
            answer: completion.choices[0].message.content,
            sources: topChunks.map(t => ({ chunk: t.id, score: Number(t.score.toFixed(4)) }))
        });
    } catch (err) {
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

// B. TEACHER VISION MARKER (Nano Banana)
app.post('/api/grade-image', async (req, res) => {
    try {
        const { imageBase64, markingScheme, topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `ZIMSEC Examiner Mode: Mark this handwritten student script for ${topic} using this scheme: ${markingScheme}. Score /10.` },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                    ],
                },
            ],
        });
        res.json({ feedback: response.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: "Vision mark failed" });
    }
});

// C. PAYMENTS (Paynow EcoCash)
app.post('/api/pay', async (req, res) => {
    const { phone, amount, email } = req.body;
    let payment = paynow.createPayment(`INV-${Date.now()}`, email);
    payment.add("Sci-Guru Pro Subscription", amount);

    try {
        const response = await paynow.sendMobile(payment, phone, "ecocash");
        if (response.success) {
            await db.collection('payments').add({ phone, amount, status: 'pending', date: new Date() });
            res.json({ pollUrl: response.pollUrl, instructions: response.instructions });
        } else {
            res.status(400).json({ error: "EcoCash failed" });
        }
    } catch (err) {
        res.status(500).json({ error: "Payment gateway error" });
    }
});

// D. PROACTIVE NUDGES (FCM)
app.post('/api/send-nudge', async (req, res) => {
    const { token, title, body } = req.body;
    try {
        await admin.messaging().send({ notification: { title, body }, token });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Nudge failed" });
    }
});

// --- 5. START ---
const PORT_FINAL = process.env.PORT || 3000;
app.listen(PORT_FINAL, () => {
    console.log(`✅ Sci-Guru Ultimate Server running on port ${PORT_FINAL}`);
});

