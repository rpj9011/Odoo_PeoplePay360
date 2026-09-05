const mongoose = require("mongoose");

const announcementReadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    lastReadTime: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for faster queries
announcementReadSchema.index({ userId: 1 });

module.exports = mongoose.model("AnnouncementRead", announcementReadSchema);
