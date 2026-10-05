import bcrypt from "bcrypt";

import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import {
  successResponse,
  errorResponse,
} from "../utils/responseHandler.js";

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return errorResponse(
        res,
        "Name, email and password are required",
        400
      );
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return errorResponse(
        res,
        "Email already registered",
        409
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      user_type: "USER",
    });

    const token = generateToken(user);

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      user_type: user.user_type,
      profile_image: user.profile_image,
    };

    return successResponse(
      res,
      "Signup successful",
      {
        user: userData,
        token,
      },
      201
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(
        res,
        "Email and password are required",
        400
      );
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return errorResponse(
        res,
        "Invalid email or password",
        401
      );
    }

    if (user.is_blocked) {
      return errorResponse(
        res,
        "Your account has been blocked",
        403
      );
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return errorResponse(
        res,
        "Invalid email or password",
        401
      );
    }

    user.is_online = true;
    await user.save();

    const token = generateToken(user);

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      user_type: user.user_type,
      profile_image: user.profile_image,
      is_online: user.is_online,
    };

    return successResponse(res, "Login successful", {
      user: userData,
      token,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      is_online: false,
      last_seen: new Date(),
    });

    return successResponse(res, "Logout successful");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};