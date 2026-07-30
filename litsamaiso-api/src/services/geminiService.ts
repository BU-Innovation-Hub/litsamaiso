import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");
  }
  return genAI;
}

export interface GeneratedAdministrativeEmail {
  subject: string;
  body: string;
}

export async function composeAdministrativeEmail(input: {
  prompt: string;
  tone: string;
}): Promise<GeneratedAdministrativeEmail> {
  const prompt = String(input.prompt || "").trim();
  const tone = String(input.tone || "").trim();

  if (!prompt) {
    throw new Error("Prompt is required");
  }
  if (!tone) {
    throw new Error("Desired tone is required");
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
  }

  const model = getGenAI().getGenerativeModel({ model: "gemini-3.5-flash" });
  const result = await model.generateContent(`You are the administrative writing assistant for Litsamaiso.

Write clear administrative email copy for the Litsamaiso platform.

Use this tone: ${tone}

Administrator prompt:
${prompt}

Return only valid JSON in this exact shape:
{
  "subject": "short, specific subject line",
  "body": "complete email body as plain text with paragraph breaks"
}

Guidelines:
- Generate only the email content. Do not include branding, layout, HTML, or template wrappers.
- Do not invent recipient names, dates, amounts, or private details not supplied in the prompt.
- Keep the body complete and ready to send.
- Sign off as the Litsamaiso Team unless the prompt explicitly says otherwise.`);

  const responseText = result.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini did not return a valid email draft");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Gemini returned an invalid email draft format");
  }

  const draft = parsed as Partial<GeneratedAdministrativeEmail>;
  const subject = String(draft.subject || "").trim();
  const body = String(draft.body || "").trim();

  if (!subject || !body) {
    throw new Error("Gemini returned an incomplete email draft");
  }

  return { subject, body };
}

export function extractAccountCandidates(text: string): string[] {
  const normalized = text.replace(/[^\x20-\x7E\n]/g, " ");

  const correctOcrArtifacts = (num: string): string => {
    return num
      .replace(/O/g, "0")
      .replace(/l/g, "1")
      .replace(/I/g, "1")
      .replace(/S/g, "5")
      .replace(/B/g, "8")
      .replace(/Z/g, "2");
  };

  const candidates = new Map<string, { count: number; confidence: number }>();

  const labelPatterns = [
    /smart\s*account[:\s-]*([0-9\-\s]{8,24})/gi,
    /(?:account|a\/c|acct)[.\s]*(?:no\.?|number|#)?[:\s-]*([0-9\-\s]{8,24})/gi,
    /my\s+account[:\s-]*([0-9\-\s]{8,24})/gi,
  ];

  for (const pattern of labelPatterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      let num = match[1]?.replace(/[\s-]/g, "") || "";
      num = correctOcrArtifacts(num);

      if (/^\d{8,13}$/.test(num)) {
        candidates.set(num, { count: (candidates.get(num)?.count || 0) + 1, confidence: 95 });
      }
    }
  }

  const normalizedLines = normalized.split(/\r?\n/);
  const headerText = normalizedLines
    .slice(0, Math.ceil(normalizedLines.length * 0.25))
    .join(" ");

  const allNumbers = Array.from(headerText.matchAll(/\b(\d{8,13})\b/g))
    .map((match) => match[1] || "")
    .map((num) => correctOcrArtifacts(num))
    .filter((num) => /^\d+$/.test(num));

  for (const num of allNumbers) {
    candidates.set(num, { count: (candidates.get(num)?.count || 0) + 1, confidence: 80 });
  }

  const allDocNumbers = Array.from(normalized.matchAll(/\b(\d{10,13})\b/g))
    .map((match) => match[1] || "")
    .map((num) => correctOcrArtifacts(num))
    .filter((num) => /^\d+$/.test(num) && !/(\d)\1{5,}/.test(num));

  for (const num of allDocNumbers) {
    if (!candidates.has(num)) {
      candidates.set(num, { count: 1, confidence: 70 });
    }
  }

  return Array.from(candidates.entries())
    .sort(([, a], [, b]) => {
      const scoreA = a.confidence * a.count;
      const scoreB = b.confidence * b.count;
      return scoreB - scoreA;
    })
    .map(([num]) => num)
    .slice(0, 15);
}
