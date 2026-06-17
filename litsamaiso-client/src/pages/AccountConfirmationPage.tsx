import React, { useEffect, useState } from 'react';
import { CheckCircle, FileImage, Loader, RefreshCcw } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { toast } from 'sonner';
import { accountService } from '../services/accountService';
import apiClient from '../services/authService';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../hooks/useAuth';
import Globe from '../components/ui/Globe';

type ExtractedDetails = {
  bankName: string;
  accountNumber: string;
  confidence: number;
};

const BANK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'First National Bank', pattern: /\bfirst\s+national\s+bank\b|\bfnb\b|@fnb\.|www\.fnb\./i },
  { name: 'Standard Bank', pattern: /\bstandard\s+bank\b|\bsbl\b|www\.standardbank\./i },
  { name: 'Stanbic', pattern: /\bstanbic\b|www\.stanbic\./i },
  { name: 'ABSA', pattern: /\babsa\b/i },
  { name: 'Post Bank', pattern: /\bpost\s*bank\b|\bpostbank\b/i },
  { name: 'Nedbank', pattern: /\bnedbank\b|www\.nedbank\./i },
  { name: 'Bank Gaborone', pattern: /\bbank\s+gaborone\b/i },
  { name: 'Access Bank', pattern: /\baccess\s*bank\b/i },
];

const parseBankProofText = (rawText: string): ExtractedDetails => {
  const normalized = rawText.replace(/[^\x20-\x7E\n]/g, ' ');
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bankMatch = BANK_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  const fallbackBankLine = lines.find((line) => /bank/i.test(line) && line.length <= 60);
  const labelMatch = normalized.match(/account(?:\s*no\.?|\s*number)?[:\s-]*([0-9\-\s]{8,24})/i);
  const accountNumber = labelMatch?.[1]
    ? labelMatch[1].replace(/[\s-]/g, '')
    : Array.from(normalized.matchAll(/\b\d{8,20}\b/g))
        .map((match) => match[0])
        .sort((left, right) => right.length - left.length)[0] || '';

  const bankName = bankMatch?.name || fallbackBankLine || '';
  const confidence = Number(
    ((bankName ? 45 : 0) + (accountNumber ? 45 : 0) + (rawText.length > 80 ? 10 : 0)).toFixed(0),
  );

  return {
    bankName,
    accountNumber,
    confidence,
  };
};

const AccountConfirmationPage: React.FC = () => {
  const { user } = useAuth();
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [extracted, setExtracted] = useState<ExtractedDetails | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [formData, setFormData] = useState({
    contractNumber: '',
    bankName: '',
    accountNumber: '',
    graduating: false,
  });

  // Confidence score is intentionally hidden from students (UX requirement).

  const handleRetry = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setExtracted(null);
    setOcrText('');
    setReviewAccepted(false);
    // clear file input if present
    const fileInput = document.querySelector('input[type=file]') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  useEffect(() => {
    const checkConfirmationStatus = async () => {
      try {
        const response = await accountService.getConfirmationStatus();
        setIsConfirmed(response.confirmed);
      } catch (error: unknown) {
        setStatusError(getApiErrorMessage(error, 'Unable to check confirmation status'));
      } finally {
        setIsCheckingStatus(false);
      }
    };

    void checkConfirmationStatus();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (name === 'bankName' || name === 'accountNumber') {
      setReviewAccepted(false);
    }
  };

  const applyExtractedDetails = (details: ExtractedDetails) => {
    setFormData((prev) => ({
      ...prev,
      bankName: details.bankName || prev.bankName,
      accountNumber: details.accountNumber || prev.accountNumber,
    }));
    setReviewAccepted(Boolean(details.bankName && details.accountNumber));
  };

  const acceptEnteredDetails = () => {
    if (!formData.bankName.trim() || !formData.accountNumber.trim()) {
      toast.error('Enter both bank name and account number first');
      return;
    }

    setReviewAccepted(true);
    toast.success('Bank details applied. You can confirm now.');
  };

  const runOcr = async (file: File) => {
    setIsExtracting(true);
    setReviewAccepted(false);
    setOcrText('');
    setExtracted(null);

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: undefined,
      });
      const text = result.data.text || '';
      const details = parseBankProofText(text);
      setOcrText(text);
      setExtracted(details);
      applyExtractedDetails(details);

      if (details.bankName && details.accountNumber) {
        toast.success('Bank details extracted. Please review before confirming.');
      } else {
        toast.message('OCR finished. Please fill in any missing bank details.');
      }
    } catch (error) {
      toast.error('Could not read the image. You can still enter the details manually.');
      setOcrText(error instanceof Error ? error.message : '');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file for OCR');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    void runOcr(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.bankName.trim() || !formData.accountNumber.trim()) {
      toast.error('Bank name and account number are required');
      return;
    }

    if (!/^\d{12}$/.test(formData.contractNumber.trim())) {
      toast.error('Contract number must be exactly 12 digits');
      return;
    }

    if (extracted && !reviewAccepted) {
      toast.error('Review and accept or edit the extracted details first');
      return;
    }

    setIsSubmitting(true);

    try {
      // If a preview image is present (user uploaded), send it as multipart to allow server to attach proof
      if ((document.querySelector('input[type=file]') as HTMLInputElement)?.files?.[0]) {
        const file = (document.querySelector('input[type=file]') as HTMLInputElement).files![0];
        const form = new FormData();
        form.append('contractNumber', formData.contractNumber);
        form.append('bankName', formData.bankName);
        form.append('accountNumber', formData.accountNumber);
        form.append('graduating', String(formData.graduating));
        form.append('document', file);
        try {
          const resp = await apiClient.post('/accounts/confirm', form, { headers: { 'Content-Type': 'multipart/form-data' } });
          const data = resp.data;
          toast.success(data.message || 'Account confirmed');
          setIsConfirmed(true);
        } catch (err: any) {
          // axios throws for non-2xx; inspect response for server-provided indicators
          const respErr = err?.response?.data;
          if (respErr) {
            if (respErr.needsProof) {
              toast.message('Account mismatch — redirected to Issues for resolution.');
              window.location.href = '/issues';
              return;
            }
            if (respErr.issue) {
              toast.message('Issue created — redirected to Issues for resolution.');
              window.location.href = '/issues';
              return;
            }
            toast.error(getApiErrorMessage(respErr, 'Account confirmation failed'));
          } else {
            toast.error(getApiErrorMessage(err, 'Account confirmation failed'));
          }
        }
      } else {
        const response = await accountService.confirmAccount(formData);
        toast.success(response.message || 'Account confirmed');
        setIsConfirmed(true);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Account confirmation failed'));
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

  if (isConfirmed) {
    return (
      <div className="global-bg min-h-screen pt-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <img
            src="/confirmed-illustration.webp"
            alt="Confirmed"
            className="mb-8 h-52 w-52 object-contain"
          />
          <h1 className="text-4xl font-bold text-primary-clr">Account Already Confirmed</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Your account details have already been confirmed. No further action is required.
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
                  <h1 className="text-2xl font-bold text-primary-clr">Confirm Account</h1>
                  <p className="text-sm text-muted-foreground">
                    Upload your bank proof, review the extracted details, then confirm.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium">Contract Number</label>
                  <input
                    name="contractNumber"
                    value={formData.contractNumber}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
                    placeholder="e.g. 202211001706"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Student ID</label>
                  <input
                    value={user?.studentId || ''}
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

                <div className="rounded-lg border border-dashed border-gray-300 bg-white/70 p-4 cursor-pointer">
                  <label className="mb-3 block text-sm font-medium">Upload Bank Confirmation</label>
                  <div className="flex items-center gap-3">
                    <FileImage className="text-active" size={24} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="block w-full text-sm"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A clear screenshot or photo helps extract the bank name and account number.
                  </p>
                </div>

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
                      Check these values carefully. Edit below if the OCR got anything wrong.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          applyExtractedDetails(extracted);
                          toast.success("Details accepted");
                        }}
                        className="inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-sm font-semibold text-white"
                      >
                        <CheckCircle size={16} />
                        Yes, they're correct
                      </button>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
                      >
                        <RefreshCcw size={16} />
                        Retry upload
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium">Bank Name</label>
                  <input
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
                    placeholder="e.g. FNB"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Account Number</label>
                  <input
                    name="accountNumber"
                    value={formData.accountNumber}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-active"
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
                  disabled={isSubmitting || isExtracting}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-button py-3 font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {isSubmitting && <Loader size={18} className="animate-spin" />}
                  {isSubmitting ? 'Confirming...' : 'Confirm Account'}
                </button>
              </form>
            </div>

            <div className="flex items-center justify-center">
              <article className="relative mx-auto min-h-112.5 w-full overflow-hidden rounded-3xl border bg-linear-to-b from-[#e60a64] to-[#e60a64]/5 p-6 text-3xl tracking-tight text-white shadow-lg md:p-8 md:text-4xl md:leading-[1.05] lg:text-5xl">
                Why walk to campus when you can tap?
                <div className="absolute -right-20 -bottom-20 z-10 mx-auto flex h-full w-full max-w-sm items-center justify-center transition-all duration-700 hover:scale-105 md:-right-28 md:-bottom-28 md:max-w-xl">
                  <Globe scale={1.1} baseColor={[1, 0, 0.3]} markerColor={[0, 0, 0]} glowColor={[1, 0.3, 0.4]} />
                </div>
                <div className="mt-8 rounded-2xl bg-white/10 p-4 backdrop-blur">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Bank proof preview"
                      className="max-h-65 w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex min-h-55 flex-col items-center justify-center rounded-lg border border-white/20 text-center text-base text-white/80">
                      <FileImage className="mb-3" size={32} />
                      Your bank proof preview appears here.
                    </div>
                  )}
                </div>
                {ocrText && (
                  <details className="mt-4 rounded-lg bg-black/20 p-3 text-sm">
                    <summary className="cursor-pointer">View OCR text</summary>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-white/80">
                      {ocrText}
                    </pre>
                  </details>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setExtracted(null);
                    setOcrText('');
                    setReviewAccepted(false);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <RefreshCcw size={16} />
                  Reset upload
                </button>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountConfirmationPage;
