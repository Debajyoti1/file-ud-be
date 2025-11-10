const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Stored filename is required"],
    },
    actualName: {
      type: String,
      required: [true, "Original filename is required"],
    },
    size: {
      type: Number,
      required: [true, "File size is required"],
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required"],
    },
    public: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

fileSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id; 
  },
});


fileSchema.index({ user: 1, createdAt: -1 });

const File = mongoose.model("File", fileSchema);
module.exports = File;
