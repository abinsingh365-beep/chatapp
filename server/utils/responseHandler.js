export const successResponse = (
  res,
  message,
  data = null,
  statusCode = 200
) => {
  return res.status(statusCode).json({
    status: true,
    message,
    data,
  });
};

export const errorResponse = (
  res,
  message,
  statusCode = 500
) => {
  return res.status(statusCode).json({
    status: false,
    message,
  });
};