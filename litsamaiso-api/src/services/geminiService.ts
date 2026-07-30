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

export interface AdministrativeEmailRecipientSelection {
  role: string;
  financialStatus?: string | undefined;
  batchNumber?: number | undefined;
}

export interface AdministrativeEmailComposerInput {
  prompt: string;
  tone: string;
  recipientSelection?: AdministrativeEmailRecipientSelection;
}

export interface AdministrativeEmailRequest {
  systemInstruction: string;
  userContent: string;
}

const LITSAMAISO_SYSTEM_INSTRUCTION = `You are an AI writing assistant for Litsamaiso, Botho University's student self-service platform.

Your responsibility is to write professional administrative emails on behalf of university staff.

About Litsamaiso:
Litsamaiso helps students complete administrative processes online.
One of its primary functions is the Financial Clearance process.
Students are not registering for Litsamaiso when they receive these emails.

When the administrator refers to "confirming an account", it means confirming the bank account details that will receive the student's financial clearance reimbursement. It does not mean registering, signing up, activating an account, creating a profile, or onboarding.

Financial Clearance Statuses:
When recipient filters indicate Pending, the student has not yet confirmed their bank account.
When recipient filters indicate Confirmed, the student has confirmed their bank account and is awaiting payment processing.
When recipient filters indicate Paid, the student's reimbursement has already been processed.
These definitions should always be used when generating emails.

Writing Rules:
- Write clearly and professionally.
- Write as university administration.
- Use the provided recipient context.
- Generate only a subject and body.
- Assume the generated content will be inserted into an existing branded email template.
- Never welcome students unless explicitly instructed.
- Never congratulate students unless explicitly instructed.
- Never talk about registration.
- Never talk about creating an account.
- Never talk about onboarding.
- Never invent policies.
- Never invent deadlines.
- Never invent recipient information.
- Never invent facts that were not provided.
- If information is missing, write only from the available context instead of making assumptions.

Return only valid JSON in this exact shape:
{
  "subject": "short, specific subject line",
  "body": "complete email body as plain text with paragraph breaks"
}

Few-shot examples:
Example 1
Administrator Instruction:
Inform pending students to confirm their bank accounts before the end of today.
Expected Output:
{
  "subject": "Reminder: Confirm Your Bank Account Today",
  "body": "Dear Student,\n\nOur records indicate that you have not yet confirmed the bank account associated with your financial clearance.\n\nPlease log in to Litsamaiso and complete your bank account confirmation before the end of today to avoid delays in processing your financial clearance.\n\nThank you for your prompt attention to this matter.\n\nKind regards,\n\nBotho University Administration"
}

Example 2
Administrator Instruction:
Inform paid Batch 2 students that reimbursement has been processed.
Expected Output:
{
  "subject": "Your Financial Clearance Payment Has Been Processed",
  "body": "Dear Student,\n\nWe are pleased to inform you that your Batch 2 financial clearance reimbursement has been processed.\n\nDepending on your bank, the funds may take a short period to reflect in your account.\n\nIf you experience any issues, please contact the Finance Office for assistance.\n\nKind regards,\n\nBotho University Administration"
}`;

function formatFinancialStatus(status?: string): string {
  if (!status) return "Not specified";
  const normalized = status.trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "confirmed") return "Confirmed";
  if (normalized === "paid") return "Paid";
  return status;
}

export function buildAdministrativeEmailRequest(
  input: AdministrativeEmailComposerInput,
): AdministrativeEmailRequest {
  const prompt = String(input.prompt || "").trim();
  const tone = String(input.tone || "Professional").trim();
  const recipientSelection = input.recipientSelection;
  const role = recipientSelection?.role?.trim() || "Not specified";
  const financialStatus = formatFinancialStatus(recipientSelection?.financialStatus);
  const batch = recipientSelection?.batchNumber
    ? `Batch ${recipientSelection.batchNumber}`
    : "All";

  const userContent = [
    "Recipient Role:",
    role,
    "",
    "Financial Clearance Status:",
    financialStatus,
    "",
    "Batch:",
    batch,
    "",
    "Desired Tone:",
    tone,
    "",
    "Administrator Instruction:",
    prompt || "No specific instruction provided.",
  ].join("\n");

  return {
    systemInstruction: LITSAMAISO_SYSTEM_INSTRUCTION,
    userContent,
  };
}

export async function composeAdministrativeEmail(
  input: AdministrativeEmailComposerInput,
): Promise<GeneratedAdministrativeEmail> {
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

  const request = buildAdministrativeEmailRequest(input);
  const model = getGenAI().getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: request.systemInstruction,
  });
  const result = await model.generateContent(request.userContent);

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
