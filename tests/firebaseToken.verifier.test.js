const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');

const { createFirebaseTokenVerifier } = require('../src/domains/auth/firebaseToken.verifier');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const projectId = 'plainedu-test';
const kid = 'firebase-key-1';

const signFirebaseToken = (overrides = {}) => jwt.sign(
  {
    sub: 'firebase-user-1',
    user_id: 'firebase-user-1',
    email: 'student@inu.ac.kr',
    auth_time: Math.floor(Date.now() / 1000) - 10,
    ...overrides,
  },
  privateKey,
  {
    algorithm: 'RS256',
    keyid: kid,
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    expiresIn: '5m',
  }
);

const createVerifier = () => createFirebaseTokenVerifier({
  projectId,
  fetchCertificates: async () => ({
    certificates: { [kid]: publicKey.export({ type: 'spki', format: 'pem' }) },
    maxAgeSeconds: 300,
  }),
});

test('Firebase 공개키로 서명·issuer·audience를 검증하고 uid를 정규화한다', async () => {
  const decoded = await createVerifier().verify(signFirebaseToken());

  assert.equal(decoded.uid, 'firebase-user-1');
  assert.equal(decoded.email, 'student@inu.ac.kr');
});

test('다른 Firebase 프로젝트용 토큰은 거부한다', async () => {
  const otherProjectToken = jwt.sign(
    { sub: 'attacker', auth_time: Math.floor(Date.now() / 1000) - 10 },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: kid,
      audience: 'other-project',
      issuer: 'https://securetoken.google.com/other-project',
      expiresIn: '5m',
    }
  );

  await assert.rejects(
    createVerifier().verify(otherProjectToken),
    (error) => error.status === 401 && error.code === 'FIREBASE_TOKEN_INVALID'
  );
});
