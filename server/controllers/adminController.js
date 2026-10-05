import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

import {
  successResponse,
  errorResponse,
} from "../utils/responseHandler.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      "All users fetched successfully",
      users
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return errorResponse(
        res,
        "User not found",
        404
      );
    }

    if (user.user_type === "ADMIN") {
      return errorResponse(
        res,
        "Admin cannot be blocked",
        400
      );
    }

    user.is_blocked = true;
    user.is_online = false;

    await user.save();

    return successResponse(
      res,
      "User blocked successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return errorResponse(
        res,
        "User not found",
        404
      );
    }

    user.is_blocked = false;

    await user.save();

    return successResponse(
      res,
      "User unblocked successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getAllConversations = async (req, res) => {
  try {
    const conversations =
      await Conversation.find()
        .populate("participants", "-password")
        .populate("last_message")
        .sort({ updatedAt: -1 });

    return successResponse(
      res,
      "All conversations fetched successfully",
      conversations
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getAllMessages = async (req, res) => {
  try {
    const messages = await Message.find()
      .populate("sender", "-password")
      .populate("receiver", "-password")
      .populate("conversation")
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      "All messages fetched successfully",
      messages
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({
      user_type: "USER",
    });

    const blockedUsers = await User.countDocuments({
      user_type: "USER",
      is_blocked: true,
    });

    const onlineUsers = await User.countDocuments({
      user_type: "USER",
      is_online: true,
    });

    const totalConversations =
      await Conversation.countDocuments();

    const totalMessages =
      await Message.countDocuments();

    return successResponse(
      res,
      "Dashboard statistics fetched successfully",
      {
        totalUsers,
        blockedUsers,
        onlineUsers,
        totalConversations,
        totalMessages,
      }
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};