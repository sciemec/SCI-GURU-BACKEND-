const express = require('express');
const cors = require('cors');
const path = require('path');
const { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { FaissStore } = require("@langchain/community/vectorstores/faiss");

const app = express();
const PORT = 3001;

// 1. MIDDLEWARE
app.use(cors()); // Allows your frontend to talk to this backend
app.use(express.json());

// 2. CONFIGURATION
const GOOGLE_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // Paste your Gemini key here

// 3. INITIALIZE AI MODELS
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GOOGLE_API_KEY,
    modelName: "models/text-embedding-004", // Must match your index_books.py!
});

const model = new ChatGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY,
    modelName: "gemini-1.5-flash",
    temperature: 0.3, // Lower temperature makes the tutor more factual
});

// 4. THE CHAT ROUTE
app.post('/api/chat', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ error: "No question provided" });
        }

        // A. LOAD YOUR FAISS INDEX
        // This folder was created by your index_books.py script
        const indexDirectory = path.join(__dirname, "faiss_index");
        const vectorStore = await FaissStore.load(indexDirectory, embeddings);

        // B. SEARCH THE BOOKS FOR RELEVANT CONTEXT
        const searchResults = await vectorStore.similaritySearch(question, 4);
        const contextText = searchResults.map(doc => doc.pageContent).join("\n\n");

        // C. CREATE THE TUTOR PROMPT
        const prompt = `
        You are a helpful and expert Heritage Science Tutor. 
        Use the following excerpts from the science books to answer the student's question.
        If the answer is not in the text, say you don't know rather than making it up.

        RELEVANT EXCERPTS:
        ${contextText}

        STUDENT QUESTION:
        ${question}
        `;

        // D. GET RESPONSE FROM GEMINI
        const result = await model.invoke(prompt);
        
        res.json({ 
            answer: result.content,
            sources: searchResults.map(doc => doc.metadata.source || "Unknown Book")
        });

    } catch (error) {
        console.error("Error in Chat API:", error);
        res.status(500).json({ error: "The tutor is a bit confused. Please check your API key or index." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Heritage Science Tutor Backend running at http://localhost:${PORT}`);
    console.log(`📂 Looking for index at: ${path.join(__dirname, "faiss_index")}`);
});
