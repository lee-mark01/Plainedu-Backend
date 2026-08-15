const jwt = require('jsonwebtoken');
const AppError = require('../../errors/AppError');

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const fetchFirebaseCertificates = async () => {
  const response = await fetch(CERT_URL);
  if (!response.ok) throw new Error(`Firebase certificate fetch failed: ${response.status}`);

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeSeconds = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  return {
    certificates: await response.json(),
    maxAgeSeconds,
  };
};

const createFirebaseTokenVerifier = ({ projectId, fetchCertificates = fetchFirebaseCertificates }) => {
  let cache = { certificates: {}, expiresAt: 0 };

  const getCertificates = async () => {
    if (Date.now() < cache.expiresAt && Object.keys(cache.certificates).length > 0) {
      return cache.certificates;
    }

    const next = await fetchCertificates();
    cache = {
      certificates: next.certificates,
      expiresAt: Date.now() + Math.max(60, next.maxAgeSeconds || 300) * 1000,
    };
    return cache.certificates;
  };

  const verify = async (idToken) => {
    if (!idToken) {
      throw new AppError('Firebase ID 토큰이 없습니다.', 400, 'FIREBASE_TOKEN_REQUIRED');
    }

    try {
      const header = jwt.decode(idToken, { complete: true })?.header;
      if (!header?.kid || header.alg !== 'RS256') throw new Error('Unexpected Firebase token header');

      const certificates = await getCertificates();
      const certificate = certificates[header.kid];
      if (!certificate) throw new Error('Unknown Firebase signing key');

      const decoded = jwt.verify(idToken, certificate, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
      });

      if (!decoded.sub || decoded.sub.length > 128 || !decoded.auth_time) {
        throw new Error('Invalid Firebase token payload');
      }

      return { ...decoded, uid: decoded.sub };
    } catch (error) {
      console.warn('[auth] Firebase ID 토큰 검증 실패:', error.code || error.message);
      throw new AppError('유효하지 않은 Firebase ID 토큰입니다.', 401, 'FIREBASE_TOKEN_INVALID');
    }
  };

  return { verify };
};

const firebaseTokenVerifier = createFirebaseTokenVerifier({
  projectId: process.env.FIREBASE_PROJECT_ID || 'plainedu-2c6b9',
});

module.exports = {
  createFirebaseTokenVerifier,
  verifyFirebaseIdToken: firebaseTokenVerifier.verify,
};
