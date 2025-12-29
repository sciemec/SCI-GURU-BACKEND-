require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const { Paynow } = require('paynow');

const app = express();

// --- 1. MIDDLEWARE & SECURITY ---
const allowedOrigins = ['https://sciemec.github.io', 'http://localhost:5500'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS Policy Violation'));
    }
}));
app.use(express.json({ limit: '25mb' })); // Large limit for high-res homework photos

// --- 2. INITIALIZE SERVICES ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Firebase Admin for Auth & Nudges
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Paynow Configuration
const paynow = new Paynow(process.env.PAYNOW_ID, process.env.PAYNOW_KEY);
paynow.resultUrl = "https://sci-guru-backend.onrender.com/api/payment-update";

// --- 3. STUDENT CHAT ROUTE (WITH MEMORY) ---
app.post('/api/chat', async (req, res) => {
    try {
        const { question, history, topic, form, isPremium } = req.body;
        
        const systemPrompt = `You are Sci-Guru, a ZIMSEC Tutor. Use Zimbabwean Heritage-based examples (e.g., Kariba, Hwange, local flora). 
        Topic: ${topic}. Form: ${form}. ${isPremium ? "Provide advanced insights." : "Keep it simple."}`;

        const completion = await openai.chat.completions.create({
            model: isPremium ? "gpt-4-turbo" : "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                ...history,
                { role: "user", content: question }
            ]
        });

        res.json({ text: completion.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: "Chat AI failed" });
    }
});

// --- 4. TEACHER "NANO BANANA" VISION ROUTE ---
app.post('/api/grade-image', async (req, res) => {
    try {
        const { imageBase64, markingScheme, topic, isPremium } = req.body;
        if (!isPremium) return res.status(403).json({ error: "Subscription required for Vision Marker." });

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // The visual reasoning model
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `ZIMSEC Examiner Mode. Topic: ${topic}. Scheme: ${markingScheme}. Mark this handwritten script out of 10. List errors and provide feedback.` },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                    ],
                },
            ],
        });
        res.json({ feedback: response.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: "Vision processing failed" });
    }
});

// --- 5. PROACTIVE NUDGE (FCM) ---
app.post('/api/send-nudge', async (req, res) => {
    const { token, title, body } = req.body;
    try {
        await admin.messaging().send({
            notification: { title, body },
            token: token
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Nudge failed" });
    }
});

// --- 6. PAYNOW ECOCASH ROUTE ---
app.post('/api/pay', async (req, res) => {
    const { phone, amount, email } = req.body;
    let payment = paynow.createPayment(`INV-${Date.now()}`, email);
    payment.add("Sci-Guru Pro Subscription", amount);

    try {
        const response = await paynow.sendMobile(payment, phone, "ecocash");
        if (response.success) {
            res.json({ pollUrl: response.pollUrl, instructions: response.instructions });
        } else {
            res.status(400).json({ error: "EcoCash Request Failed" });
        }
    } catch (err) {
        res.status(500).json({ error: "Payment system offline" });
    }
});

// --- 7. ADMIN REVENUE LOGS ---
app.get('/api/admin/stats', async (req, res) => {
    // Basic secret key check for simple security
    if (req.headers['x-admin-key'] !== process.env.ADMIN_SECRET) return res.status(401).send("Unauthorized");
    
    try {
        const users = await admin.auth().listUsers();
        res.json({ totalUsers: users.users.length });
    } catch (err) {
        res.status(500).json({ error: "Admin fetch failed" });
    }
});

// --- 8. STARTUP ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Sci-Guru Master Server running on Port ${PORT}`);
});
