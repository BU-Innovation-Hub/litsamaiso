import test from "node:test";
import assert from "node:assert/strict";
import { buildAdministrativeEmailRequest } from "./geminiService.js";

test("builds a structured Gemini request with domain instructions and recipient context", () => {
  const request = buildAdministrativeEmailRequest({
    prompt: "Inform pending students to confirm their bank accounts before the end of today.",
    tone: "Professional",
    recipientSelection: {
      role: "Student",
      financialStatus: "pending",
      batchNumber: 2,
    },
  });

  assert.match(request.systemInstruction, /Litsamaiso/);
  assert.match(request.systemInstruction, /Financial Clearance/);
  assert.match(request.systemInstruction, /confirming the bank account details/);
  assert.match(request.userContent, /Recipient Role:/);
  assert.match(request.userContent, /Financial Clearance Status:/);
  assert.match(request.userContent, /Batch:/);
  assert.match(request.userContent, /Administrator Instruction:/);
});
