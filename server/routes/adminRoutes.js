import express from "express";

import {
  getAllUsers,
  blockUser,
  unblockUser,
  getAllConversations,
  getAllMessages,
  getDashboardStats,
} from "../controllers/adminController.js";

import protect from "../middleware/authMiddleware.js";
import adminOnly from "../middleware/adminMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get("/users", getAllUsers);

router.put("/users/block/:userId", blockUser);

router.put(
  "/users/unblock/:userId",
  unblockUser
);

router.get(
  "/conversations",
  getAllConversations
);

router.get("/messages", getAllMessages);

router.get("/stats", getDashboardStats);

export default router;