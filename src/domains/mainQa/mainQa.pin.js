const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 32;

const verifyMainQaPin = async (pin, stored) => {
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

module.exports = { verifyMainQaPin };
