require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- 1. SYSTEM PROMPT LOGIC ---
const BASE_INSTRUCTIONS = `You are Sci-Guru, a ZIMSEC Science Tutor in Zimbabwe. 
Follow the Heritage-Based Curriculum. Use local examples (e.g., Kariba Dam for electricity, 
Hwange for coal/energy, local plants like Aloe or Baobab for biology). 
Always explain concepts simply for Form 1-4 students.`;

// --- 2. STUDENT ROUTE ---
app.post('/api/chat', async (req, res) => {
    try {
        const { question, topic, form, action } = req.body;
        
        let userPrompt = `Student Question: ${question}. Topic: ${topic}. Level: ${form}.`;
        if(action === 'practical') userPrompt += " Provide a step-by-step practical experiment a student can do.";

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: BASE_INSTRUCTIONS },
                { role: "user", content: userPrompt }
            ]
        });

        res.json({ text: completion.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "AI Engine Error" });
    }
});

// --- 3. TEACHER PORTAL ROUTE ---
app.post('/api/teacher-tools', async (req, res) => {
    try {
        const { type, topic, form } = req.body;
        
        let teacherSystemPrompt = "You are a ZIMSEC Head of Science Department. Provide professional, printable documents.";
        let teacherUserPrompt = "";

        if (type === 'scheme_of_work') {
            teacherUserPrompt = `Create a 4-week Scheme of Work table for ${topic} (${form}). 
            Include columns for Week, Topic, Objectives, Competencies, and Suggested Media/Activities.`;
        } else if (type === 'lesson_plan') {
            teacherUserPrompt = `Create a detailed 40-minute lesson plan for ${topic}. Include Objectives, Introduction, Body, and Evaluation.`;
        } else {
            teacherUserPrompt = `Generate a ZIMSEC Paper 1 style quiz for ${topic}.`;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4", // Teachers get the smarter model for better documents
            messages: [
                { role: "system", content: teacherSystemPrompt },
                { role: "user", content: teacherUserPrompt }
            ]
        });

        res.json({ text: completion.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Teacher Portal Error" });
    }
});

// --- 4. HEALTH CHECK & AUTO-WAKE ---
app.get('/api/health', (req, res) => {
    res.status(200).send("Sci-Guru is Awake");
});

// Self-ping every 10 minutes to stay alive on Render Free Tier
setInterval(() => {
    axios.get('https://sci-guru-backend.onrender.com/api/health')
        .then(() => console.log('Self-ping success'))
        .catch(err => console.log('Self-ping failed'));
}, 600000); 

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
