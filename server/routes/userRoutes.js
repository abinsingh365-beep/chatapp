import express from "express";

import {
  getUsers,
  getProfile,
  updateProfile,
  blockUser,
  unblockUser,
} from "../controllers/userController.js";

import protect from "../middleware/authMiddleware.js";
import attachmentUpload from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/all", protect, getUsers);

router.get("/profile", protect, getProfile);

router.put(
  "/profile",
  protect,
  attachmentUpload.single("profileImage"),
  updateProfile
);

router.put("/block/:userId", protect, blockUser);

router.put("/unblock/:userId", protect, unblockUser);

export default router;