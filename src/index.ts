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

type AnalysisResult = {
  matchScore: number;
  missingKeywords: string[];
  tailoredSummary: string;
  coverLetter: string;
};

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function isValidAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.matchScore === "number" &&
    Number.isFinite(v.matchScore) &&
    Array.isArray(v.missingKeywords) &&
    v.missingKeywords.every((k) => typeof k === "string") &&
    typeof v.tailoredSummary === "string" &&
    typeof v.coverLetter === "string"
  );
}

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

    // Parse JSON robustly (models sometimes include wrappers).
    const withoutFences = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const jsonCandidate = extractFirstJsonObject(withoutFences);
    if (!jsonCandidate) {
      return res.status(502).json({
        error: "Model returned no JSON object.",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      return res.status(502).json({
        error: "Model returned invalid JSON.",
      });
    }

    if (!isValidAnalysisResult(parsed)) {
      return res.status(502).json({
        error: "Model returned an unexpected response shape.",
      });
    }

    const result: AnalysisResult = {
      matchScore: Math.max(0, Math.min(100, Math.round(parsed.matchScore))),
      missingKeywords: parsed.missingKeywords
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 20),
      tailoredSummary: parsed.tailoredSummary.trim(),
      coverLetter: parsed.coverLetter.trim(),
    };

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
