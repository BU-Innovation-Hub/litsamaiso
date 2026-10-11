import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { isValidObjectId } from "mongoose";
import { OnboardingDraft, type OnboardingDraftDocument } from "../models/OnboardingDraft.js";
import { User } from "../models/User.js";
import { isPlanKey, PLANS } from "../config/plans.js";
import { getClientBaseUrl, getPriceId, getStripe } from "../config/stripe.js";
import AppError from "../utils/errors.js";
import { signToken } from "../utils/authToken.js";
import { SESSION_INSTITUTION_FIELDS } from "../utils/sessionUser.js";
import { DEFAULT_THEME, parseTheme, validateTheme } from "../utils/themePalette.js";
import {
  isInstitutionEmailTaken,
  isUserEmailTaken,
} from "../services/institutionProvisioningService.js";
import { provisionFromDraft } from "../services/billingService.js";

const TOKEN_HEADER = "x-onboarding-token";
const SESSION_CLAIM_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DraftDoc = OnboardingDraftDocument & { _id: unknown; save: () => Promise<unknown> };

class FieldError extends AppError {
  constructor(public field: string, message: string, statusCode = 400) {
    super(message, statusCode);
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const handleError = (res: Response, err: unknown) => {
  if (err instanceof FieldError) {
    res.status(err.statusCode).json({ message: err.message, field: err.field });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error("[onboarding]", err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

/** Loads a draft and checks the resume token held by the browser that created it. */
const loadDraft = async (req: Request, id: unknown) => {
  if (typeof id !== "string" || !isValidObjectId(id)) throw new AppError("Onboarding not found", 404);
  const token = req.header(TOKEN_HEADER);
  const draft = await OnboardingDraft.findById(id).select("+resumeTokenHash +admin.passwordHash");
  if (!draft || !token) throw new AppError("Onboarding not found", 404);

  const expected = Buffer.from(draft.resumeTokenHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError("Onboarding not found", 404);
  }
  return draft;
};

const serializeDraft = (draft: OnboardingDraftDocument & { _id: unknown }) => ({
  id: String(draft._id),
  status: draft.status,
  plan: draft.plan,
  institution: {
    name: draft.institution?.name ?? "",
    email: draft.institution?.email ?? "",
    phone: draft.institution?.phone ?? "",
    address: draft.institution?.address ?? "",
    website: draft.institution?.website ?? "",
    country: draft.institution?.country ?? "",
    expectedStudents: draft.institution?.expectedStudents ?? null,
  },
  admin: {
    name: draft.admin?.name ?? "",
    email: draft.admin?.email ?? "",
    title: draft.admin?.title ?? "",
    hasPassword: Boolean(draft.admin?.passwordHash),
  },
  theme: draft.theme?.preset ? draft.theme : null,
  acknowledgedInstitutionAdmin: Boolean(draft.acknowledgedInstitutionAdminAt),
  failureReason: draft.status === "failed" ? draft.failureReason ?? null : null,
});

const text = (value: unknown, field: string, label: string, opts: { required?: boolean; max?: number } = {}) => {
  const str = typeof value === "string" ? value.trim() : "";
  if (!str) {
    if (opts.required) throw new FieldError(field, `${label} is required`);
    return undefined;
  }
  if (str.length > (opts.max ?? 200)) throw new FieldError(field, `${label} is too long`);
  return str;
};

const email = (value: unknown, field: string, label: string) => {
  const str = text(value, field, label, { required: true, max: 254 })!.toLowerCase();
  if (!EMAIL_RE.test(str)) throw new FieldError(field, `${label} must be a valid email address`);
  return str;
};

const applyInstitution = async (draft: DraftDoc, input: Record<string, unknown>) => {
  const institutionEmail = email(input.email, "institution.email", "Institution email");
  if (await isInstitutionEmailTaken(institutionEmail)) {
    throw new FieldError(
      "institution.email",
      "An institution with this email is already on Litsamaiso. Sign in instead, or contact support.",
      409,
    );
  }
  const expected = input.expectedStudents;
  const expectedStudents =
    expected === undefined || expected === null || expected === "" ? undefined : Number(expected);
  if (expectedStudents !== undefined && (!Number.isInteger(expectedStudents) || expectedStudents < 0)) {
    throw new FieldError("institution.expectedStudents", "Expected students must be a whole number");
  }
  const website = text(input.website, "institution.website", "Website", { max: 200 });
  if (website && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(website)) {
    throw new FieldError("institution.website", "Website must be a valid URL");
  }

  const institution: NonNullable<OnboardingDraftDocument["institution"]> = {
    name: text(input.name, "institution.name", "Institution name", { required: true, max: 120 })!,
    email: institutionEmail,
  };
  const phone = text(input.phone, "institution.phone", "Phone", { max: 40 });
  const address = text(input.address, "institution.address", "Address", { max: 300 });
  const country = text(input.country, "institution.country", "Country", { max: 80 });
  if (phone) institution.phone = phone;
  if (address) institution.address = address;
  if (website) institution.website = website;
  if (country) institution.country = country;
  if (expectedStudents !== undefined) institution.expectedStudents = expectedStudents;
  draft.institution = institution;
};

const applyAdmin = async (draft: DraftDoc, input: Record<string, unknown>) => {
  const adminEmail = email(input.email, "admin.email", "Email");
  if (await isUserEmailTaken(adminEmail)) {
    throw new FieldError("admin.email", "This email already has a Litsamaiso account. Use a different email.", 409);
  }

  const password = typeof input.password === "string" ? input.password : "";
  const existingHash = draft.admin?.passwordHash;
  if (password) {
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      throw new FieldError("admin.password", "Password must be at least 8 characters and include a letter and a number");
    }
  } else if (!existingHash) {
    throw new FieldError("admin.password", "Password is required");
  }

  const admin: NonNullable<OnboardingDraftDocument["admin"]> = {
    name: text(input.name, "admin.name", "Your name", { required: true, max: 120 })!,
    email: adminEmail,
  };
  const title = text(input.title, "admin.title", "Job title", { max: 120 });
  if (title) admin.title = title;
  const passwordHash = password ? await bcrypt.hash(password, 10) : existingHash;
  if (passwordHash) admin.passwordHash = passwordHash;
  draft.admin = admin;
};

const applyTheme = (draft: DraftDoc, input: unknown) => {
  const theme = parseTheme(input);
  // Logos are added after sign-in (uploads require an account).
  delete theme.logoUrl;
  const issues = validateTheme(theme);
  if (issues.length) throw new FieldError("theme", issues[0]!);
  draft.theme = theme as NonNullable<OnboardingDraftDocument["theme"]>;
};

const assertEditable = (draft: OnboardingDraftDocument) => {
  if (draft.status !== "draft" && draft.status !== "checkout") {
    throw new AppError("This onboarding has already been completed.", 409);
  }
};

// POST /onboarding/drafts
export const createDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const plan = (req.body as { plan?: unknown })?.plan;
    if (!isPlanKey(plan)) throw new FieldError("plan", "Choose a valid plan");

    const resumeToken = randomBytes(32).toString("hex");
    const draft = await OnboardingDraft.create({ plan, resumeTokenHash: hashToken(resumeToken) });
    res.status(201).json({ draft: serializeDraft(draft), resumeToken });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /onboarding/drafts/:id
export const getDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const draft = await loadDraft(req, req.params.id);
    res.json({ draft: serializeDraft(draft) });
  } catch (err) {
    handleError(res, err);
  }
};

// PATCH /onboarding/drafts/:id — saves one or more wizard steps.
export const updateDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const draft = (await loadDraft(req, req.params.id)) as unknown as DraftDoc;
    assertEditable(draft);
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (body.plan !== undefined) {
      if (!isPlanKey(body.plan)) throw new FieldError("plan", "Choose a valid plan");
      draft.plan = body.plan;
    }
    if (body.institution && typeof body.institution === "object") {
      await applyInstitution(draft, body.institution as Record<string, unknown>);
    }
    if (body.admin && typeof body.admin === "object") {
      await applyAdmin(draft, body.admin as Record<string, unknown>);
    }
    if (body.theme !== undefined) applyTheme(draft, body.theme);
    if (body.acknowledgedInstitutionAdmin !== undefined) {
      if (body.acknowledgedInstitutionAdmin === true) draft.acknowledgedInstitutionAdminAt = new Date();
      else (draft as unknown as { set: (path: string, value: unknown) => void }).set("acknowledgedInstitutionAdminAt", undefined);
    }

    await draft.save();
    res.json({ draft: serializeDraft(draft) });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /onboarding/drafts/:id/checkout — starts Stripe Checkout.
export const startCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const draft = (await loadDraft(req, req.params.id)) as unknown as DraftDoc;
    assertEditable(draft);

    const { institution, admin } = draft;
    if (!institution?.name || !institution.email) throw new FieldError("institution", "Add your institution details first");
    if (!admin?.name || !admin.email || !admin.passwordHash) throw new FieldError("admin", "Create the admin account first");
    if (!draft.acknowledgedInstitutionAdminAt) {
      throw new FieldError(
        "acknowledgedInstitutionAdmin",
        "Please confirm that this account will become your institution's Institution Admin",
      );
    }
    // Someone may have claimed these emails since the step was saved.
    if (await isInstitutionEmailTaken(institution.email)) {
      throw new FieldError("institution.email", "An institution with this email is already on Litsamaiso.", 409);
    }
    if (await isUserEmailTaken(admin.email)) {
      throw new FieldError("admin.email", "This email already has a Litsamaiso account.", 409);
    }
    if (!draft.theme?.preset) draft.theme = { ...DEFAULT_THEME };

    const stripe = getStripe();
    const price = await getPriceId(draft.plan);
    const draftId = String(draft._id);

    if (!draft.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: institution.email,
        name: institution.name,
        metadata: { draftId },
      });
      draft.stripeCustomerId = customer.id;
    }

    const base = getClientBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: draft.stripeCustomerId,
      client_reference_id: draftId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/onboarding?draft=${draftId}&canceled=1`,
      billing_address_collection: "required",
      customer_update: { name: "auto", address: "auto" },
      metadata: { draftId, plan: draft.plan },
      subscription_data: {
        description: `Litsamaiso ${PLANS[draft.plan].name} — ${institution.name}`,
        metadata: { draftId, plan: draft.plan },
      },
    });
    if (!session.url) throw new AppError("Could not start checkout. Please try again.", 502);

    draft.stripeCheckoutSessionId = session.id;
    draft.status = "checkout";
    await draft.save();

    res.json({ url: session.url });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /onboarding/complete — polled by the success page after Checkout.
export const completeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = (req.body as { sessionId?: unknown })?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      throw new AppError("Invalid checkout session", 400);
    }
    const found = await OnboardingDraft.findOne({ stripeCheckoutSessionId: sessionId }).select("_id");
    if (!found) throw new AppError("Onboarding not found", 404);
    let draft = await loadDraft(req, String(found._id));

    if (draft.status === "checkout" || draft.status === "provisioning") {
      await provisionFromDraft(String(draft._id));
      draft = await loadDraft(req, String(draft._id));
    }

    if (draft.status === "failed") {
      res.json({
        status: "failed",
        message:
          "Your payment was received, but we couldn't finish setting up your workspace automatically. " +
          "Our team has been notified and will contact you shortly.",
      });
      return;
    }
    if (draft.status !== "provisioned" || !draft.provisionedUser) {
      res.json({ status: "pending" });
      return;
    }

    // The session hand-off is only available shortly after the first claim
    // (retries and double-mounted effects); afterwards the admin signs in normally.
    const firstClaim = await OnboardingDraft.findOneAndUpdate(
      { _id: draft._id, sessionClaimedAt: { $exists: false } },
      { $set: { sessionClaimedAt: new Date() } },
    );
    const claimedAt = draft.sessionClaimedAt?.getTime();
    const withinClaimWindow = claimedAt !== undefined && Date.now() - claimedAt <= SESSION_CLAIM_WINDOW_MS;
    if (!firstClaim && !withinClaimWindow) {
      res.json({ status: "claimed", message: "Your workspace is ready. Please sign in." });
      return;
    }

    const user = await User.findById(draft.provisionedUser)
      .populate("role", "name")
      .populate("institution", SESSION_INSTITUTION_FIELDS);
    if (!user) throw new AppError("Account not found", 404);

    res.json({
      status: "ready",
      token: signToken(user._id.toString(), false),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institution: user.institution,
        tour: user.tour,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
};
