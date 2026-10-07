import express from "express";
import { getProfileImage } from "../controllers/mediaController.js";

const router = express.Router();

router.get("/profile/:fileId", getProfileImage);

export default router;
