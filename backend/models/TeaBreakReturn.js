const mongoose = require("mongoose");

const teaBreakReturnSchema = new mongoose.Schema(
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
    endedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    overrunMinutes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

teaBreakReturnSchema.index({ announcementId: 1, userId: 1 }, { unique: true });
teaBreakReturnSchema.index({ announcementId: 1, endedAt: -1 });

module.exports = mongoose.model("TeaBreakReturn", teaBreakReturnSchema);
