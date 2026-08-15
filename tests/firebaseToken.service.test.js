const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createFirebaseTokenService } = require('../src/domains/auth/firebaseToken.service');

const decodedToken = {
  uid: 'firebase-uid-123',
  email: 'student@inu.ac.kr',
  name: '플레인 학생',
  firebase: { sign_in_provider: 'custom' },
};

const createDependencies = ({ existingByFirebase = null, existingByEmail = null } = {}) => {
  const users = [];
  const savedTokens = [];
  const repository = {
    findUserBySnsId: async (provider, snsId) =>
      provider === 'firebase' && snsId === decodedToken.uid ? existingByFirebase : null,
    findUserByEmail: async (email) => email === decodedToken.email ? existingByEmail : null,
    createOauthUser: async (user) => {
      users.push(user);
      return 91;
    },
    findUserById: async (id) => ({ id, email: decodedToken.email, nickname: decodedToken.name, role: 'USER' }),
    saveRefreshToken: async (token) => savedTokens.push(token),
  };

  return {
    users,
    savedTokens,
    repository,
    accountService: {
      getOrCreateIndividualAccount: async (userId) => ({ id: 7, user_id: userId }),
    },
    tokenTools: {
      signAccessToken: ({ userId, role }) => `access:${userId}:${role}`,
      generateRefreshToken: () => 'refresh-token',
      hashToken: (token) => `hash:${token}`,
    },
    randomUUID: () => 'family-id',
  };
};

test('검증된 Firebase 사용자가 없으면 백엔드 사용자와 토큰 쌍을 만든다', async () => {
  const deps = createDependencies();
  const service = createFirebaseTokenService(deps);

  const result = await service.exchange(decodedToken, { ipAddress: '127.0.0.1', userAgent: 'test' });

  assert.equal(result.isNew, true);
  assert.equal(result.accessToken, 'access:91:USER');
  assert.equal(result.refreshToken, 'refresh-token');
  assert.deepEqual(deps.users, [{
    email: 'student@inu.ac.kr',
    nickname: '플레인 학생',
    provider: 'firebase',
    snsId: 'firebase-uid-123',
  }]);
  assert.equal(deps.savedTokens.length, 1);
  assert.equal(deps.savedTokens[0].userId, 91);
  assert.equal(deps.savedTokens[0].tokenHash, 'hash:refresh-token');
  assert.equal(deps.savedTokens[0].familyId, 'family-id');
});

test('같은 이메일의 기존 백엔드 사용자는 중복 생성하지 않고 연결한다', async () => {
  const existing = { id: 12, email: decodedToken.email, nickname: '기존 사용자', role: 'USER', provider: 'google' };
  const deps = createDependencies({ existingByEmail: existing });
  const service = createFirebaseTokenService(deps);

  const result = await service.exchange(decodedToken, { ipAddress: '127.0.0.1', userAgent: 'test' });

  assert.equal(result.isNew, false);
  assert.equal(result.user.id, 12);
  assert.equal(result.accessToken, 'access:12:USER');
  assert.deepEqual(deps.users, []);
});

test('이메일이 없는 Firebase 토큰은 계정 생성 전에 거부한다', async () => {
  const deps = createDependencies();
  const service = createFirebaseTokenService(deps);

  await assert.rejects(
    service.exchange({ uid: 'no-email' }, { ipAddress: '127.0.0.1', userAgent: 'test' }),
    (error) => error.status === 400 && error.code === 'FIREBASE_EMAIL_REQUIRED'
  );
  assert.deepEqual(deps.users, []);
  assert.deepEqual(deps.savedTokens, []);
});
