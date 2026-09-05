const mongoose = require("mongoose");

const announcementViewSchema = new mongoose.Schema(
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
    viewedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

announcementViewSchema.index({ announcementId: 1, userId: 1 }, { unique: true });
announcementViewSchema.index({ userId: 1 });
announcementViewSchema.index({ announcementId: 1 });

module.exports = mongoose.model("AnnouncementView", announcementViewSchema);
