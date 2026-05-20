class AppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
