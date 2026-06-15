import type { Request, Response } from "express";
import { Feedback } from "../models/Feedback.js";
import { recordAudit } from "../utils/auditLog.js";

export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { rating?: number; comment?: string };
    const rating = Number(body.rating || 0);
    const comment = body.comment ? String(body.comment).trim() : undefined;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ message: "rating must be an integer between 1 and 5" });
      return;
    }

    const payload: any = { rating };
    if (comment !== undefined) payload.comment = comment;

    const feedbackDoc = new Feedback(payload);
    await feedbackDoc.save();

    await recordAudit({
      action: "feedback.submit",
      targetCollection: "Feedback",
      targetId: feedbackDoc._id?.toString(),
      details: { rating, comment },
    });

    res.status(201).json({ message: "Thank you for your feedback" });
  } catch (err: any) {
    await recordAudit({
      action: "feedback.submit.failed",
      details: { error: err.message || String(err) },
    });
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const listFeedback = async (req: Request, res: Response) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 }).lean();

    const user = (req as any).user;
    await recordAudit({
      action: "feedback.view",
      actorId: user?._id?.toString(),
      actorEmail: user?.email,
      actorRole: (user && (user.role as any)?.name) || undefined,
      targetCollection: "Feedback",
      details: { count: feedbacks.length },
    });

    res.json({ feedbacks });
  } catch (err: any) {
    await recordAudit({
      action: "feedback.view.failed",
      details: { error: err.message || String(err) },
    });
    res.status(500).json({ message: err.message || String(err) });
  }
};
