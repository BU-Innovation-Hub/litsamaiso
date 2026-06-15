import { model, Schema } from "mongoose";

export interface FeedbackDocument {
  rating: number;
  comment?: string;
}

const feedbackSchema = new Schema<FeedbackDocument>(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Feedback = model<FeedbackDocument>("Feedback", feedbackSchema);
export default Feedback;
