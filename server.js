// ----------------------------
// Sci-Guru Backend Server
// ----------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

app.use(cors());
app.use(express.json());

// ----------------------------
// TEST ROUTE
// ----------------------------
app.get('/', (req, res) => {
  res.send('Sci-Guru Tutor AI backend is running ✅');
});

// ----------------------------
// 1) EXPLAIN ROUTE
// ----------------------------
app.post('/api/explain', async (req, res) => {
  try {
    const { question, level = "Form 1", topic = "General Science" } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Missing question' });
    }

    const systemPrompt = `
You are Sci-Guru, an AI science tutor for Zimbabwean students (Forms 1–4),
aligned with ZIMSEC and the Heritage-Based Curriculum.

Your job when explaining is:
- Use very clear, simple language for the selected level.
- Use local Zimbabwean rural and urban examples.
- Include a short Heritage Hook.
- Include one simple low-cost practical activity.
- End with 3 short quiz questions.

Format:

1. Short Answer
2. Step-by-step Explanation
3. Heritage Hook
4. Simple Practical Activity
5. Quiz Questions (3)
    `.trim();

    const userPrompt = `
Level: ${level}
Topic: ${topic}
Question: ${question}
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 900,
    });

    const answer = completion.choices[0].message.content;
    res.json({ success: true, answer });
  } catch (err) {
    console.error("Error in /api/explain:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------
// 2) QUIZ ROUTE
// ----------------------------
app.post('/api/quiz', async (req, res) => {
  try {
    const {
      level = "Form 1",
      topic = "General Science",
      numQuestions = 5,
    } = req.body;

    const systemPrompt = `
You are Sci-Guru, an AI science tutor for Zimbabwean students (Forms 1–4),
aligned with ZIMSEC and the Heritage-Based Curriculum.

You generate exam-style quizzes for science topics.

Requirements:
- Use the selected level (Form 1–4) and topic.
- Create ${numQuestions} multiple-choice questions (A, B, C, D).
- Start each question with its number (1., 2., 3., etc).
- Do NOT explain the answers.
- End with an Answer Key.

Use clear language and include Zimbabwean context where possible.
    `.trim();

    const userPrompt = `
Create a quiz.

Level: ${level}
Topic: ${topic}
Number of questions: ${numQuestions}
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const quizText = completion.choices[0].message.content;
    res.json({ success: true, quiz: quizText });
  } catch (err) {
    console.error("Error in /api/quiz:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------
// 3) PRACTICAL ROUTE (TEXT)
// ----------------------------
app.post('/api/practical', async (req, res) => {
  try {
    const {
      level = "Form 1",
      topic = "General Science",
    } = req.body;

    const systemPrompt = `
You are Sci-Guru, an AI practical coach for Zimbabwean students (Forms 1–4),
aligned with ZIMSEC and the Heritage-Based Curriculum.

You design LOW-COST or improvised experiments suitable for Zimbabwean schools.

Format:
- Title
- Aim
- Apparatus (include improvised items!)
- Method (steps)
- Safety precautions
- Expected results
- Conclusion
- Follow-up questions
- SimulationConfig (describe objects and goal for future interactive simulation)
    `.trim();

    const userPrompt = `
Design one practical experiment.

Level: ${level}
Topic: ${topic}
Zimbabwean context.
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 1200,
    });

    const practicalText = completion.choices[0].message.content;
    res.json({ success: true, practical: practicalText });
  } catch (err) {
    console.error("Error in /api/practical:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------
// 4) PRACTICAL STRUCTURED (JSON FOR AUTO LAB)
// ----------------------------
app.post('/api/practical-structured', async (req, res) => {
  try {
    const {
      level = "Form 1",
      topic = "Density",  // we mainly support density for now
    } = req.body;

    const systemPrompt = `
You are Sci-Guru, an AI practical coach for Zimbabwean students (Forms 1–4).

Return a SINGLE JSON object only, no extra text, that describes
a low-cost practical AND a simulation config.

The JSON MUST have this exact shape:

{
  "title": string,
  "aim": string,
  "apparatus": string[],
  "steps": string[],
  "safety": string[],
  "expected": string[],
  "conclusion": string,
  "followup": string[],
  "simulation": {
    "simType": "density_tank",
    "description": string,
    "objects": [
      { "id": "rock", "label": "Rock", "behaviour": "sink" },
      { "id": "wood", "label": "Wood", "behaviour": "float" }
    ]
  }
}

Rules:
- For now, ALWAYS use simType "density_tank".
- objects[].behaviour must be either "sink" or "float".
- Do NOT include any keys that are not listed above.
- Do NOT wrap JSON in backticks or say "Here is the JSON".
Just output the raw JSON.
    `.trim();

    const userPrompt = `
Create a density practical for level: ${level}, topic: ${topic},
for a Zimbabwean school with simple materials (stones, wood block, bucket, water).
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse failed for /api/practical-structured:", e, raw);
      return res.status(500).json({
        success: false,
        error: "Failed to parse JSON from model."
      });
    }

    res.json({ success: true, practical: parsed });
  } catch (err) {
    console.error("Error in /api/practical-structured:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------
// 5) ELECTRICITY EXPLAIN ROUTE
// ----------------------------
app.post('/api/electricity-explain', async (req, res) => {
  try {
    const { components = [] } = req.body;

    const prompt = `
You are Sci-Guru, an AI tutor for Zimbabwean students (Forms 1–4).
Explain the simple electric circuit the learner built.

Components used: ${components.join(', ')}

Explain in this structure:
1. Is the circuit complete or incomplete?
2. Will the bulb light? Why or why not?
3. What important component might be missing?
4. Use simple Zimbabwean examples (torch, solar light, homestead wiring).
Use very clear language.
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    const answer = completion.choices[0].message.content;
    res.json({ success: true, answer });
  } catch (err) {
    console.error("Error in /api/electricity-explain:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Sci-Guru backend running at http://localhost:${PORT}`);
});