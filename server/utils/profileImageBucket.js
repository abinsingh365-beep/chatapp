import mongoose from "mongoose";

const BUCKET_NAME = "profileImages";

export const getProfileImageBucket = () => {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("Database is not connected");
  }

  return new mongoose.mongo.GridFSBucket(database, { bucketName: BUCKET_NAME });
};
