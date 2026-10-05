import express from "express";

import {
  sendMessage,
  sendAttachmentMessage,
  getMessages,
  markMessagesSeen,
} from "../controllers/messageController.js";

import protect from "../middleware/authMiddleware.js";
import attachmentUpload from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.post("/send", protect, sendMessage);

router.post(
  "/send-image",
  protect,
  attachmentUpload.single("image"),
  sendAttachmentMessage
);

router.get(
  "/:conversationId",
  protect,
  getMessages
);

router.put(
  "/seen/:conversationId",
  protect,
  markMessagesSeen
);

export default router;