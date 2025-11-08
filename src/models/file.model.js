const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // allows fast lookup by user
    },
    name: {
      type: String,
      required: [true, "Stored filename is required"], // saved filename on disk (e.g., UUID)
    },
    actualName: {
      type: String,
      required: [true, "Original filename is required"], // original name from upload
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


// Compound index for faster user-specific file queries with sorting
fileSchema.index({ user: 1, createdAt: -1 });

const File = mongoose.model("File", fileSchema);
module.exports = File;
