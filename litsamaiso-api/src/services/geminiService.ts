import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export interface ExtractionCandidate {
  number: string;
  confidence: number;
  reason: string;
}

export interface GeminiExtractionResult {
  accountNumber: string | null;
  bankName: string | null;
  confidence: number; // 0-100
  candidates: ExtractionCandidate[];
  reasoning: string;
  shouldPromptUser: boolean; // True if confidence 70-85%
}

function validateSAAccountFormat(num: string): { valid: boolean; confidence: number; reason: string } {
  if (!num || !/^[0-9]+$/.test(num)) {
    return { valid: false, confidence: 0, reason: "Non-numeric" };
  }

  const length = num.length;
  let confidence = 100;
  let reason = "";

  if (length === 11) {
    reason = "Standard SA 11-digit format";
    confidence = 100;
  } else if (length >= 10 && length <= 13) {
    reason = `Acceptable length (${length} digits, expected 11)`;
    confidence = 85;
  } else {
    reason = `Invalid length: ${length} digits (expected 8-13)`;
    confidence = 0;
    return { valid: false, confidence, reason };
  }

  const knownBranchCodes = new Set([
    "011", "250", "198", "008", "062", "051", "632", "633", "634",
    "635", "636", "637", "638", "801", "802", "105", "106", "107", "108",
  ]);

  const firstThree = num.substring(0, 3);
  if (knownBranchCodes.has(firstThree)) {
    confidence = Math.min(100, confidence + 15);
    reason += " with recognized branch code";
  }

  if (/(\d)\1{5,}/.test(num)) {
    confidence = Math.max(0, confidence - 40);
    reason += " - WARNING: repeating sequence detected";
    return { valid: false, confidence, reason };
  }

  return { valid: confidence >= 70, confidence, reason };
}

export async function validateWithGemini(
  imageBase64: string,
  ocrExtractedText: string,
  candidates: string[],
  bankName: string | null,
): Promise<GeminiExtractionResult> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const candidatesInfo = candidates
      .slice(0, 10)
      .map((c) => {
        const validation = validateSAAccountFormat(c);
        return `- ${c} (${c.length} digits, SA validation: ${validation.reason})`;
      })
      .join("\n");

    const prompt = `You are a financial document analysis expert. Analyze this bank statement to identify the account number.

## Task
Extract the account number from the bank statement. Use these guidelines:
- South African account numbers are typically 11 digits
- Format: 3-digit branch code + 8-digit account number
- Common banks: FNB, Standard Bank, Stanbic, ABSA, Nedbank
- Account number labels may appear as: "Account No.", "A/c", "Smart Account", "My Account", "Account #"

## OCR Extracted Text:
${ocrExtractedText}

## Detected Bank:
${bankName || "Unknown"}

## Candidate Numbers (extracted from OCR):
${candidatesInfo}

## Your Response (JSON format):
{
  "accountNumber": "the most likely account number or null",
  "confidence": 0-100,
  "selectedCandidateReason": "why you chose this candidate or why you extracted fresh",
  "allCandidatesRanked": [
    {"number": "candidate1", "confidence": 95, "reason": "matches SA format with known branch code"},
    {"number": "candidate2", "confidence": 70, "reason": "valid length but no known branch code"}
  ],
  "reasoning": "detailed explanation of your analysis"
}

## Important:
- Only return valid JSON
- Confidence should reflect how sure you are this is the account number
- If no candidates match SA format, extract the most likely number from the image directly
- Return null for accountNumber if completely unable to determine
- Validate against SA banking standards: 11-digit format, known branch codes`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
      prompt,
    ] as any);

    const responseText = result.response.text();

    let parsedResponse: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response:", responseText);
      const validatedCandidates = candidates
        .map((c) => {
          const validation = validateSAAccountFormat(c);
          return {
            number: c,
            confidence: validation.confidence,
            reason: validation.reason,
          };
        })
        .filter((x) => x.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence);

      return {
        accountNumber: validatedCandidates[0]?.number || null,
        bankName,
        confidence: validatedCandidates[0]?.confidence || 0,
        candidates: validatedCandidates.slice(0, 3),
        reasoning: "Fallback to local validation (Gemini parse failed)",
        shouldPromptUser: (validatedCandidates[0]?.confidence || 0) < 85,
      };
    }

    let finalConfidence = parsedResponse.confidence || 0;
    if (parsedResponse.accountNumber) {
      const validation = validateSAAccountFormat(parsedResponse.accountNumber);
      finalConfidence = (finalConfidence + validation.confidence) / 2;
    }

    return {
      accountNumber: parsedResponse.accountNumber || null,
      bankName,
      confidence: Math.round(finalConfidence),
      candidates: (parsedResponse.allCandidatesRanked || [])
        .slice(0, 3)
        .map((c: any) => ({
          number: c.number,
          confidence: c.confidence,
          reason: c.reason,
        })),
      reasoning: parsedResponse.reasoning || "Unable to provide detailed reasoning",
      shouldPromptUser: finalConfidence >= 70 && finalConfidence < 85,
    };
  } catch (error) {
    console.error("Gemini extraction error:", error);
    throw error;
  }
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
    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(normalized)) !== null) {
      let num = match[1]?.replace(/[\s-]/g, "") || "";
      num = correctOcrArtifacts(num);

      if (/^\d{8,13}$/.test(num)) {
        candidates.set(num, { count: (candidates.get(num)?.count || 0) + 1, confidence: 95 });
      }
    }
  }

  const lines = normalized.split(/\r?\n/).slice(0, Math.ceil(normalized.split(/\r?\n/).length * 0.25));
  const headerText = lines.join(" ");

  const allNumbers = Array.from(headerText.matchAll(/\b(\d{8,13})\b/g))
    .map((m) => m[1] || "")
    .map((num) => correctOcrArtifacts(num))
    .filter((num) => /^\d+$/.test(num));

  for (const num of allNumbers) {
    candidates.set(num, { count: (candidates.get(num)?.count || 0) + 1, confidence: 80 });
  }

  const allDocNumbers = Array.from(normalized.matchAll(/\b(\d{10,13})\b/g))
    .map((m) => m[1] || "")
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
