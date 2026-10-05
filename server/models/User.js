import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    profile_image: {
      type: String,
      default: "",
    },

    user_type: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },

    is_online: {
      type: Boolean,
      default: false,
    },

    last_seen: {
      type: Date,
      default: null,
    },

    is_blocked: {
      type: Boolean,
      default: false,
    },

    blocked_users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;