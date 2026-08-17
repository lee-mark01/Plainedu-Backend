const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 32;

const hashQaPin = async (pin, salt = crypto.randomBytes(16)) => {
  const key = await scrypt(String(pin), salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
};

const verifyQaPin = async (pin, stored) => {
  const [saltHex, keyHex, extra] = String(stored || '').split(':');
  if (!saltHex || !keyHex || extra !== undefined) return false;
  try {
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await scrypt(String(pin), Buffer.from(saltHex, 'hex'), KEY_LENGTH);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

module.exports = { hashQaPin, verifyQaPin };
