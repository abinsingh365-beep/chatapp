import Conversation from "../models/Conversation.js";
import User from "../models/User.js";

import {
  successResponse,
  errorResponse,
} from "../utils/responseHandler.js";

export const createConversation = async (req, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return errorResponse(
        res,
        "Receiver ID is required",
        400
      );
    }

    const receiver = await User.findById(receiverId);

    if (!receiver) {
      return errorResponse(
        res,
        "Receiver not found",
        404
      );
    }

    const existingConversation =
      await Conversation.findOne({
        participants: {
          $all: [req.user._id, receiverId],
        },
      });

    if (existingConversation) {
      return successResponse(
        res,
        "Conversation already exists",
        existingConversation
      );
    }

    const conversation = await Conversation.create({
      participants: [req.user._id, receiverId],
    });

    return successResponse(
      res,
      "Conversation created",
      conversation,
      201
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getMyConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate("participants", "-password")
      .populate("last_message")
      .sort({ updatedAt: -1 });

    return successResponse(
      res,
      "Conversations fetched successfully",
      conversations
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};