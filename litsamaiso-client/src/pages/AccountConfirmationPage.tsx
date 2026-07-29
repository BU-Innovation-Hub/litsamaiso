/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Loader, RefreshCcw } from "lucide-react";
import Tesseract from "tesseract.js";
import { toast } from "sonner";
import { accountService } from "../services/accountService";
import { authService } from "../services/authService";
import apiClient from "../lib/api";
import { getApiErrorMessage } from "../utils/apiError";
import { sanitizeUserForStorage } from "../utils/userDisplay";
import { useAuth } from "../hooks/useAuth";
import Globe from "../components/ui/Globe";

type ExtractedDetails = {
  bankName: string;
  accountNumber: string;
  confidence: number;
};

type BankValue = "fnb" | "slb" | "nedbank" | "lpb";

const BANK_OPTIONS = [
  { label: "First National Bank", value: "fnb" },
  { label: "Standard Lesotho Bank", value: "slb" },
  { label: "Nedbank", value: "nedbank" },
  { label: "Lesotho PostBank", value: "lpb" },
] as const;

const BANK_NAME_ALIASES: Record<string, BankValue> = {
  "first national bank": "fnb",
  fnb: "fnb",
  "standard lesotho bank": "slb",
  "standard bank": "slb",
  slb: "slb",
  sbl: "slb",
  nedbank: "nedbank",
  "nedbank lesotho": "nedbank",
  "lesotho postbank": "lpb",
  "lesotho post bank": "lpb",
  "post bank": "lpb",
  postbank: "lpb",
  lpb: "lpb",
};

const normalizeBankValue = (bankName: string): string => {
  const normalized = String(bankName || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  return BANK_NAME_ALIASES[normalized] || "";
};

const BANK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "Standard Lesotho Bank",
    pattern:
      /\bstandard\s+lesotho\s+bank\b|\bstandard\s+bank\b|\bsbl\b|www\.standardbank\./i,
  },
  {
    name: "First National Bank",
    pattern: /\bfirst\s+national\s+bank\b|\bfnb\b|@fnb\.|www\.fnb\./i,
  },
  {
    name: "Lesotho PostBank",
    pattern: /\blesotho\s+post\s+bank\b|\bpost\s*bank\b|\bpostbank\b/i,
  },
  {
    name: "Nedbank",
    pattern: /\bnedbank\s+lesotho\b|\bnedbank\b|www\.nedbank\./i,
  },
];

const parseBankProofText = (rawText: string): ExtractedDetails => {
  const normalized = rawText.replace(/[^\x20-\x7E\n]/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bankMatch = BANK_PATTERNS.find(({ pattern }) =>
    pattern.test(normalized),
  );
  const fallbackBankLine = lines.find(
    (line) => /bank/i.test(line) && line.length <= 60,
  );
  const labelMatch = normalized.match(
    /account(?:\s*no\.?|\s*number)?[:\s-]*([0-9\-\s]{8,24})/i,
  );
  const accountNumber = labelMatch?.[1]
    ? labelMatch[1].replace(/[\s-]/g, "")
    : Array.from(normalized.matchAll(/\b\d{8,20}\b/g))
        .map((match) => match[0])
        .sort((left, right) => right.length - left.length)[0] || "";

  const bankName = normalizeBankValue(
    bankMatch?.name || fallbackBankLine || "",
  );
  const confidence = Number(
    (
      (bankName ? 45 : 0) +
      (accountNumber ? 45 : 0) +
      (rawText.length > 80 ? 10 : 0)
    ).toFixed(0),
  );

  return {
    bankName,
    accountNumber,
    confidence,
  };
};

const AccountConfirmationPage: React.FC = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [contractValid, setContractValid] = useState<boolean | null>(null);
  // const [contractError, setContractError] = useState('');
  const [contractReason, setContractReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedDetails | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [formData, setFormData] = useState({
    borrowerNumber: user?.borrowerNumber || "",
    bankName: "",
    accountNumber: "",
    graduating: false,
  });

  // Confidence score is intentionally hidden from students (UX requirement).

  type ConfirmationErrorPayload = {
    message?: string;
    error?: string;
    needsProof?: boolean;
    issue?: unknown;
    issueCreated?: boolean;
    redirectTo?: string;
    status?: string;
  };

  const handleConfirmationError = (error: unknown): boolean => {
    const responseData = (
      error as { response?: { data?: ConfirmationErrorPayload } } | undefined
    )?.response?.data;
    const payload =
      responseData || (error as ConfirmationErrorPayload | undefined);

    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (
      payload.issueCreated ||
      payload.issue ||
      payload.redirectTo === "/issues"
    ) {
      toast.message(
        getApiErrorMessage(
          payload,
          "Issue created. Redirecting to Issues for resolution.",
        ),
      );
      navigate(payload.redirectTo || "/issues", {
        replace: true,
        state: { issueLogged: true },
      });
      return true;
    }

    if (payload.needsProof || payload.status === "mismatch") {
      toast.error(
        getApiErrorMessage(
          payload,
          "Account details do not match. Please try again.",
        ),
      );
      return true;
    }

    return false;
  };

  const handleRetry = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setExtracted(null);
    setReviewAccepted(false);
    // clear file input if present
    const fileInput = document.querySelector(
      "input[type=file]",
    ) as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const profileResult = await authService.getProfile();
        const profile = profileResult.data;
        if (profile) {
          localStorage.setItem(
            "user",
            JSON.stringify(sanitizeUserForStorage(profile)),
          );
          setUser(profile);
          setFormData((prev) => ({
            ...prev,
            borrowerNumber: profile.borrowerNumber || "",
          }));
        }

        const contractResult = await accountService.validateContract();
        if (!contractResult.valid) {
          setContractValid(false);
          // setContractError(contractResult.message || 'Borrower number not found in accounts list');
          setContractReason(contractResult.reason || "");
          setIsCheckingStatus(false);
          return;
        }
        setContractValid(true);
        setFormData((prev) => ({
          ...prev,
          accountNumber: contractResult.accountNumber || prev.accountNumber,
        }));

        const response = await accountService.getConfirmationStatus();
        setIsConfirmed(response.confirmed);
        setAccountStatus(response.status || null);
      } catch (error: unknown) {
        setStatusError(
          getApiErrorMessage(error, "Unable to check confirmation status"),
        );
      } finally {
        setIsCheckingStatus(false);
      }
    };

    void initialize();
  }, [setUser]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = event.target;
    const checked =
      type === "checkbox"
        ? (event as React.ChangeEvent<HTMLInputElement>).target.checked
        : undefined;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "bankName"
            ? normalizeBankValue(value)
            : value,
    }));
    if (name === "bankName" || name === "accountNumber") {
      setReviewAccepted(false);
    }
  };

  const applyExtractedDetails = (details: ExtractedDetails) => {
    setFormData((prev) => ({
      ...prev,
      bankName: normalizeBankValue(details.bankName) || prev.bankName,
      accountNumber: details.accountNumber || prev.accountNumber,
    }));
    setReviewAccepted(false);
  };

  // Bank/account fields are OCR-populated only; students explicitly accept the extracted values.

  const runOcr = async (file: File) => {
    setIsExtracting(true);
    setReviewAccepted(false);
    setExtracted(null);

    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: undefined,
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      } as any);
      const text = result.data.text || "";
      const details = parseBankProofText(text);
      setExtracted(details);
      applyExtractedDetails(details);

      if (details.bankName && details.accountNumber) {
        toast.success(
          "Bank details extracted. Please review before confirming.",
        );
      } else {
        toast.message(
          "OCR finished, but some bank details could not be read. Please retry upload.",
        );
      }
    } catch {
      toast.error(
        "Could not read the image. Please retry with a clearer bank confirmation image.",
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Upload an image file for OCR");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    void runOcr(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedBankName = normalizeBankValue(formData.bankName);
    const normalizedExtractedBankName = normalizeBankValue(
      extracted?.bankName || "",
    );
    const normalizedFormData = {
      ...formData,
      bankName: normalizedBankName,
    };

    if (!normalizedBankName || !formData.accountNumber.trim()) {
      toast.error("Bank name and account number are required");
      return;
    }

    if (!/^\d{12}$/.test(formData.borrowerNumber.trim())) {
      toast.error("Borrower number must be exactly 12 digits");
      return;
    }

    if (
      extracted &&
      !reviewAccepted &&
      normalizedBankName === normalizedExtractedBankName &&
      formData.accountNumber === extracted.accountNumber
    ) {
      toast.error("Review and accept or edit the extracted details first");
      return;
    }

    setIsSubmitting(true);

    try {
      // If a preview image is present (user uploaded), send it as multipart to allow server to attach proof
      if (
        (document.querySelector("input[type=file]") as HTMLInputElement)
          ?.files?.[0]
      ) {
        const file = (
          document.querySelector("input[type=file]") as HTMLInputElement
        ).files![0];
        const form = new FormData();
        form.append("borrowerNumber", normalizedFormData.borrowerNumber);
        form.append("bankName", normalizedFormData.bankName);
        form.append("accountNumber", normalizedFormData.accountNumber);
        form.append("graduating", String(normalizedFormData.graduating));
        form.append("document", file);
        try {
          const resp = await apiClient.post("/accounts/confirm", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const data = resp.data;
          toast.success(data.message || "Account confirmed");
          setIsConfirmed(true);
        } catch (err: unknown) {
          if (!handleConfirmationError(err)) {
            toast.error(getApiErrorMessage(err, "Account confirmation failed"));
          }
        }
      } else {
        const response =
          await accountService.confirmAccount(normalizedFormData);
        toast.success(response.message || "Account confirmed");
        setIsConfirmed(true);
      }
    } catch (error: unknown) {
      if (!handleConfirmationError(error)) {
        toast.error(getApiErrorMessage(error, "Account confirmation failed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="global-bg flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-active" />
      </div>
    );
  }

  if (contractValid === false) {
    const isWarning = contractReason === "not_in_accounts";
    return (
      <div className="global-bg min-h-screen flex items-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <div
            className={`mb-6 rounded-full p-4 ${isWarning ? "bg-amber-100" : "bg-red-100"}`}
          >
            {isWarning ? (
              <svg
                className="h-12 w-12 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="h-12 w-12 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            )}
          </div>
          <h1
            className={`text-3xl font-bold ${isWarning ? "text-amber-600" : "text-red-600"}`}
          >
            {isWarning
              ? "Your Account Not Ready For Confirmation"
              : "Borrower's Number Not Found"}
          </h1>
          {isWarning ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Your Finance Department has not yet prepared your account details
              for confirmation. Please check back later.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Please contact your institution admin or finance department to
              ensure your borrower's number is registered in the system if you
              do have a contract with NMDS.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (isConfirmed) {
    if (accountStatus === "paid") {
      return (
        <div className="global-bg min-h-screen flex items-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
            <div className="mb-6 rounded-full bg-green-100 p-4">
              <svg
                className="h-12 w-12 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-primary-clr">
              Payment Completed
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              You have been Paid wait for your bank SMS
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="global-bg min-h-screen flex items-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <img
            src="/confirmed-illustration.webp"
            alt="Confirmed"
            className="mb-8 h-52 w-52 object-contain"
          />
          <h1 className="text-4xl font-bold text-primary-clr">
            Account Confirmed
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Your account details have already been confirmed. No further action
            is required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="global-bg min-h-screen pt-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-2xl border border-zinc-200 bg-secondary/20 px-6 py-6 shadow-xl md:px-10">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="max-h-[75vh] overflow-auto pr-1 md:pr-2">
              <div className="mb-6 flex items-center gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-primary-clr">
                    Confirm Account
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Upload your bank proof, review the extracted details, then
                    confirm.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Borrower's Number
                  </label>
                  <input
                    name="borrowerNumber"
                    value={formData.borrowerNumber}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
                    placeholder="e.g. 202211001706"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Student ID
                  </label>
                  <input
                    value={user?.studentId || ""}
                    readOnly
                    className="w-full rounded-md border border-border bg-gray-100 px-4 py-2 text-muted-foreground"
                    placeholder="Student ID from your registered account"
                  />
                </div>

                {statusError && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    {statusError}
                  </div>
                )}

                {/* <div className="rounded-lg border border-dashed border-gray-300 bg-white/70 p-4 cursor-pointer">
                  <label className="mb-3 block text-sm font-medium">Upload Bank Confirmation</label>
                  <div className="flex items-center gap-3">
                    <FileImage className="text-active" size={24} /> */}
                <input
                  type="hidden"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="w-full text-sm hidden"
                />
                {/* </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A clear screenshot or photo helps extract the bank name and account number.
                  </p>
                </div> */}

                {isExtracting && (
                  <div className="flex items-center gap-2 rounded-md bg-white/70 p-3 text-sm text-muted-foreground">
                    <Loader className="animate-spin" size={16} />
                    Reading image...
                  </div>
                )}

                {extracted && (
                  <div className="space-y-3 rounded-md border bg-background/60 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Extracted details</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Check these values carefully. Retry upload if the OCR got
                      anything wrong.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          !formData.bankName.trim() ||
                          !formData.accountNumber.trim()
                        }
                        onClick={() => {
                          applyExtractedDetails(extracted);
                          setReviewAccepted(true);
                          toast.success("Details accepted");
                        }}
                        className="inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle size={16} />
                        Yes, they're correct
                      </button>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCcw size={16} />
                        Retry upload
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Bank Name
                  </label>
                  <select
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
                  >
                    <option value="" disabled>
                      Select your bank
                    </option>
                    {BANK_OPTIONS.map((bank) => (
                      <option key={bank.value} value={bank.value}>
                        {bank.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Account Number
                  </label>
                  <input
                    name="accountNumber"
                    value={formData.accountNumber}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
                    placeholder="Bank account number"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    name="graduating"
                    checked={formData.graduating}
                    onChange={handleChange}
                    className="h-4 w-4"
                  />
                  I am graduating this academic year
                </label>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isExtracting ||
                    (!reviewAccepted &&
                      extracted !== null &&
                      normalizeBankValue(formData.bankName) ===
                        normalizeBankValue(extracted.bankName) &&
                      formData.accountNumber === extracted.accountNumber)
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-button py-3 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && (
                    <Loader size={18} className="animate-spin" />
                  )}
                  {isSubmitting ? "Confirming..." : "Confirm Account"}
                </button>
              </form>
            </div>

            <div className="flex items-center justify-center">
              <article className="relative mx-auto min-h-112.5 w-full overflow-hidden rounded-3xl border bg-linear-to-b from-[#e60a64] to-[#e60a64]/5 p-6 text-3xl tracking-tight text-white shadow-lg md:p-8 md:text-4xl md:leading-[1.05] lg:text-5xl">
                Why walk to campus when you can tap?
                <div className="absolute -right-20 -bottom-20 z-10 mx-auto flex h-full w-full max-w-sm items-center justify-center transition-all duration-700 hover:scale-105 md:-right-28 md:-bottom-28 md:max-w-xl">
                  <Globe
                    scale={1.1}
                    baseColor={[1, 0, 0.3]}
                    markerColor={[0, 0, 0]}
                    glowColor={[1, 0.3, 0.4]}
                  />
                </div>
                {/* Preview moved to the left column for consistency with Next.js UI */}
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountConfirmationPage;
