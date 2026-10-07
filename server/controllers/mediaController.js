import mongoose from "mongoose";
import { getProfileImageBucket } from "../utils/profileImageBucket.js";

export const getProfileImage = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.fileId)) {
      return res.status(404).end();
    }

    const bucket = getProfileImageBucket();
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const file = await bucket.find({ _id: fileId }).next();

    if (!file || file.metadata?.purpose !== "profile-image") {
      return res.status(404).end();
    }

    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": file.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    const imageStream = bucket.openDownloadStream(fileId);
    imageStream.on("error", next);
    imageStream.pipe(res);
  } catch (error) {
    next(error);
  }
};
