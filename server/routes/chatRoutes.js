import express from "express";

import {
  createConversation,
  getMyConversations,
} from "../controllers/chatController.js";

import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/conversation",
  protect,
  createConversation
);

router.get(
  "/conversations",
  protect,
  getMyConversations
);

export default router;