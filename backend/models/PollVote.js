const mongoose = require("mongoose");

const pollAnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    optionIndices: { type: [Number], default: undefined },
    text: { type: String, maxlength: 2000, trim: true },
  },
  { _id: false }
);

const pollVoteSchema = new mongoose.Schema(
  {
    announcementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnnouncementMessage",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Legacy single-question vote
    optionIndices: {
      type: [Number],
      default: undefined,
    },
    // Multi-question survey answers
    answers: {
      type: [pollAnswerSchema],
      default: undefined,
    },
  },
  { timestamps: true }
);

pollVoteSchema.index({ announcementId: 1, userId: 1 }, { unique: true });
pollVoteSchema.index({ announcementId: 1 });

module.exports = mongoose.model("PollVote", pollVoteSchema);
