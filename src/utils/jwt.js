const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const durationSeconds = (value) => {
  if (typeof value === 'number' && value > 0) return value;
  const match = String(value || '15m').match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 15 * 60;
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * units[match[2]];
};

const signAccessToken = (payload, expiresAt = null) => {
  const configuredSeconds = durationSeconds(process.env.JWT_ACCESS_EXPIRES_IN);
  const sessionSeconds = expiresAt
    ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : configuredSeconds;
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: Math.min(configuredSeconds, sessionSeconds),
  });
};

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
