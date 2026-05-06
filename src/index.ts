import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { JOB_ANALYSIS_PROMPT } from "./prompts";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "✅ AI Job Helper API is running" });
});

app.post("/api/analyze", async (req, res) => {
  const { cv, jobDescription } = req.body;

  if (!cv || !jobDescription) {
    return res.status(400).json({
      error: "CV and job description are required",
    });
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: JOB_ANALYSIS_PROMPT,
        },
        {
          role: "user",
          content: `CV:\n${cv}\n\nJob Description:\n${jobDescription}`,
        },
      ],
    });

    const content = response.choices[0].message.content || "";

    // Clean response and parse JSON
    const cleaned = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const result = JSON.parse(cleaned);
    return res.json(result);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Analysis failed. Please try again.",
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
