import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      default: "",
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    file_url: {
      type: String,
      default: "",
    },

    file_name: {
      type: String,
      default: "",
    },

    file_type: {
      type: String,
      default: "",
    },

    message_type: {
      type: String,
      enum: ["text", "image", "file", "audio", "call"],
      default: "text",
    },

    call_type: {
      type: String,
      enum: ["audio", "video"],
    },

    call_status: {
      type: String,
      enum: ["completed", "missed", "declined"],
    },

    call_duration: {
      type: Number,
      default: 0,
    },

    is_seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;