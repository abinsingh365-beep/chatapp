const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: false,
      message: "Authentication required",
    });
  }

  if (req.user.user_type !== "ADMIN") {
    return res.status(403).json({
      status: false,
      message: "Admin access required",
    });
  }

  next();
};

export default adminOnly;