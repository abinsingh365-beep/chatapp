import multer from "multer";

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      const error = new Error("Profile photo must be an image");
      error.statusCode = 400;
      return callback(error);
    }

    callback(null, true);
  },
});

export default profileImageUpload;
