import User from "../models/User.js";
import mongoose from "mongoose";
import { getProfileImageBucket } from "../utils/profileImageBucket.js";
import {
  successResponse,
  errorResponse,
} from "../utils/responseHandler.js";

const getStoredProfileImageId = (imageUrl) => {
  const match = imageUrl?.match(/\/api\/media\/profile\/([a-f\d]{24})$/i);
  return match ? new mongoose.Types.ObjectId(match[1]) : null;
};

const removeStoredProfileImage = async (fileId) => {
  if (!fileId) return;

  try {
    await getProfileImageBucket().delete(fileId);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove replaced profile image:", error);
    }
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user._id },
      user_type: "USER",
      is_blocked: false,
    })
      .select("-password")
      .sort({ name: 1 });

    const blockedUsers = new Set(
      (req.user.blocked_users || []).map((id) => id.toString())
    );

    return successResponse(res, "Users fetched successfully", users.map((user) => ({
      ...user.toObject(),
      is_blocked_by_me: blockedUsers.has(user._id.toString()),
    })));
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password"
    );

    return successResponse(
      res,
      "Profile fetched successfully",
      user
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const updateProfile = async (req, res) => {
  let uploadedImageId;

  try {
    const { name } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    if (name) {
      user.name = name;
    }

    const previousImageId = getStoredProfileImageId(user.profile_image);

    if (req.file) {
      const bucket = getProfileImageBucket();
      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        contentType: req.file.mimetype,
        metadata: {
          owner: user._id,
          purpose: "profile-image",
        },
      });

      await new Promise((resolve, reject) => {
        uploadStream.once("error", reject);
        uploadStream.once("finish", resolve);
        uploadStream.end(req.file.buffer);
      });

      uploadedImageId = uploadStream.id;
      user.profile_image = `${req.protocol}://${req.get("host")}/api/media/profile/${uploadedImageId}`;
    }

    await user.save();
    uploadedImageId = null;

    const updatedUser = await User.findById(
      req.user._id
    ).select("-password");

    if (req.file) {
      await removeStoredProfileImage(previousImageId);
    }

    return successResponse(
      res,
      "Profile updated successfully",
      updatedUser
    );
  } catch (error) {
    if (uploadedImageId) {
      await removeStoredProfileImage(uploadedImageId);
    }
    return errorResponse(res, error.message);
  }
};

export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user._id.toString() === userId) {
      return errorResponse(res, "You cannot block yourself", 400);
    }

    const target = await User.findById(userId).select("_id");
    if (!target) return errorResponse(res, "User not found", 404);

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { blocked_users: target._id },
    });

    return successResponse(res, "User blocked successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const unblockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blocked_users: req.params.userId },
    });

    return successResponse(res, "User unblocked successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};