require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const admin = require('firebase-admin');
const { Paynow } = require('paynow');

const app = express();

// --- 1. CONFIG & SECURITY ---
// Fixed the syntax errors and added your official domain
const allowedOrigins = [
    'https://sci-guru-ai.com', 
    'https://www.sci-guru-ai.com', 
    'https://sci-guru-49796.web.app', 
    'https://sci-guru-49796.firebaseapp.com',
    'http://localhost:5000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS blocked by Sci-Guru Security'));
    }
}));

app.use(express.json({ limit: "25mb" })); 

// Paths & Models for RAG
const VEC_PATH = path.resolve(process.cwd(), "docs/zimsec_vectors.json");
const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; 
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// --- 2. INITIALIZE SERVICES ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Paynow
const paynow = new Paynow(process.env.PAYNOW_ID, process.env.PAYNOW_KEY);
paynow.resultUrl = "https://sci-guru-backend.onrender.com/api/payment-update";

// --- 3. HELPER FUNCTIONS ---
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
        zimsec_status: "Active 🇿🇼",
        vectors_loaded: fs.existsSync(VEC_PATH)
    });
});

// A. MASTER CHAT (RAG Logic)
app.post("/chat", async (req, res) => {
    try {
        const message = (req.body?.message || "").toString().trim();
        const history = req.body?.history || [];
        if (!message) return res.status(400).json({ error: "message is required" });

        const store = loadVectors();
        let context = "No specific ZIMSEC context found.";
        let topChunks = [];

        if (store) {
            const qEmbed = await openai.embeddings.create({ model: EMBED_MODEL, input: message });
            const qVec = qEmbed.data[0].embedding;

            const scored = store.chunks.map(c => ({
                id: c.id, text: c.text, score: cosineSimilarity(qVec, c.embedding)
            })).sort((a, b) => b.score - a.score);

            topChunks = scored.slice(0, 5);
            context = topChunks.map((t, i) => `(${i + 1}) ${t.text}`).join("\n\n");
        }

        const system = `You are Sci-Guru, a Zimbabwe ZIMSEC Combined Science tutor. 
        Use the ZIMSEC CONTEXT provided to answer. If context is missing, use local Zimbabwean Heritage examples.`;

        const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                { role: "system", content: system },
                ...history,
                { role: "user", content: `ZIMSEC CONTEXT:\n${context}\n\nQUESTION:\n${message}` }
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

// B. VISION MARKER
app.post('/api/grade-image', async (req, res) => {
    try {
        const { imageBase64, markingScheme, topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `ZIMSEC Examiner Mode: Mark this handwritten student script for ${topic || 'Science'} using this scheme: ${markingScheme || 'Standard ZIMSEC marks'}. Score /10.` },
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
            await db.collection('payments').add({ phone, amount, status: 'pending', date: new Date(), pollUrl: response.pollUrl });
            res.json({ pollUrl: response.pollUrl, instructions: response.instructions });
        } else {
            res.status(400).json({ error: "EcoCash failed" });
        }
    } catch (err) {
        res.status(500).json({ error: "Payment gateway error" });
    }
});

// --- 5. START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Sci-Guru Ultimate Server running on port ${PORT}`);
});
