const mongoose = require("mongoose");

const announcementMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    type: {
      type: String,
      enum: ["general", "important", "holiday", "policy"],
      default: "general",
    },
    isTEABreak: {
      type: Boolean,
      default: false,
    },
    teaBreakStartedAt: {
      type: Date,
      default: null,
    },
    teaBreakType: {
      type: String,
      enum: ["morning", "evening", "lunch"],
      default: null,
    },
    teaBreakStoppedAt: {
      type: Date,
      default: null,
    },
    contentType: {
      type: String,
      enum: ["text", "poll"],
      default: "text",
    },
    poll: {
      title: { type: String, maxlength: 200, trim: true },
      questions: [
        {
          text: { type: String, required: true, maxlength: 500, trim: true },
          type: {
            type: String,
            enum: ["multiple_choice", "text"],
            default: "multiple_choice",
          },
          options: [
            {
              text: { type: String, maxlength: 200, trim: true },
              voteCount: { type: Number, default: 0, min: 0 },
            },
          ],
          allowMultiple: { type: Boolean, default: false },
        },
      ],
      // Legacy single-question fields (kept for backward compatibility)
      question: { type: String, maxlength: 500, trim: true },
      options: [
        {
          text: { type: String, maxlength: 200, trim: true },
          voteCount: { type: Number, default: 0, min: 0 },
        },
      ],
      allowMultiple: { type: Boolean, default: false },
      isClosed: { type: Boolean, default: false },
      closesAt: { type: Date, default: null },
      totalVotes: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AnnouncementMessage",
  announcementMessageSchema
);
