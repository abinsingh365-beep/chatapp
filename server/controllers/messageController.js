import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

import {
  successResponse,
  errorResponse,
} from "../utils/responseHandler.js";

export const sendMessage = async (req, res) => {
  try {
    const {
      conversationId,
      receiverId,
      text,
    } = req.body;

    if (!conversationId || !receiverId || !text) {
      return errorResponse(
        res,
        "Conversation, receiver and text are required",
        400
      );
    }

    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return errorResponse(
        res,
        "Conversation not found",
        404
      );
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      receiver: receiverId,
      text,
      message_type: "text",
    });

    conversation.last_message = message._id;

    await conversation.save();

    const populatedMessage =
      await Message.findById(message._id)
        .populate("sender", "-password")
        .populate("receiver", "-password");

    return successResponse(
      res,
      "Message sent successfully",
      populatedMessage,
      201
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await Message.find({
      conversation: conversationId,
    })
      .populate("sender", "-password")
      .populate("receiver", "-password")
      .sort({ createdAt: 1 });

    return successResponse(
      res,
      "Messages fetched successfully",
      messages
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const markMessagesSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;

    await Message.updateMany(
      {
        conversation: conversationId,
        receiver: req.user._id,
        is_seen: false,
      },
      {
        $set: {
          is_seen: true,
        },
      }
    );

    return successResponse(
      res,
      "Messages marked as seen"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const sendAttachmentMessage = async (req, res) => {
  try {
    const { conversationId, receiverId } = req.body;

    if (!conversationId || !receiverId || !req.file) {
      return errorResponse(
        res,
        "Conversation, receiver and file are required",
        400
      );
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return errorResponse(res, "Conversation not found", 404);
    }

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith("image/");
    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      receiver: receiverId,
      image: isImage ? fileUrl : "",
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      message_type: isImage ? "image" : "file",
    });

    conversation.last_message = message._id;
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "-password")
      .populate("receiver", "-password");

    return successResponse(
      res,
      "Image sent successfully",
      populatedMessage,
      201
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};