const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
