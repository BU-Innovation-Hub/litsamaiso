import { model, Schema } from "mongoose";

export interface FeedbackDocument {
  user: Schema.Types.ObjectId;
  rating: number;
  comment?: string;
}

const feedbackSchema = new Schema<FeedbackDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Feedback = model<FeedbackDocument>("Feedback", feedbackSchema);
export default Feedback;
