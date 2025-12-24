// Changed route from /api/tutor to /api/chat to match your frontend
app.post("/api/chat", async (req, res) => {
  try {
    const {
      mode = "Notes",
      form = "Form 1",
      chapter = "",
      topic = "General",
      question = ""
    } = req.body || {};

    // Fixed model name to "gpt-4o-mini" (4.1-mini does not exist)
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const instructions = buildInstructions(mode);

    const input = [
      `Mode: ${mode}`,
      `Form: ${form}`,
      chapter ? `Chapter: ${chapter}` : null,
      `Topic: ${topic}`,
      `Extra instruction from user: ${question || "(none)"}`
    ].filter(Boolean).join("\n");

    // Updated to the correct OpenAI SDK syntax
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      temperature: 0.7,
    });

    // Send back the actual text response
    res.json({ text: completion.choices[0].message.content || "No output returned." });

  } catch (err) {
    console.error("OpenAI Error:", err);
    res.status(500).json({
      error: "Server error calling OpenAI.",
      detail: err?.message || String(err)
    });
  }
});
