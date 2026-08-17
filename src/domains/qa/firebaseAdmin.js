const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const createQaFirebaseAdmin = ({ auth, firestore }) => ({
  async ensureQaUser({ uid, email, displayName }) {
    try {
      await auth.getUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await auth.createUser({ uid, email, displayName, emailVerified: true });
    }
    await firestore.collection('users').doc(uid).set({
      termsAgreed: true,
      privacyAgreed: true,
      marketingAgreed: false,
      onboardingCompleted: true,
    }, { merge: true });
  },

  createCustomToken(uid, claims) {
    return auth.createCustomToken(uid, claims);
  },

  async deleteQaIdentity(uid) {
    await firestore.collection('users').doc(uid).delete();
    try {
      await auth.deleteUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
  },
});

let cached;

const getQaFirebaseAdmin = (config, serviceAccountJson = process.env.QA_FIREBASE_SERVICE_ACCOUNT_JSON) => {
  if (cached) return cached;
  if (!serviceAccountJson) throw new Error('QA_FIREBASE_SERVICE_ACCOUNT_JSON is required');
  const serviceAccount = JSON.parse(serviceAccountJson);
  if (serviceAccount.project_id !== config.firebaseProjectId) {
    throw new Error('QA Firebase service account project does not match QA_FIREBASE_PROJECT_ID');
  }
  const name = `qa-${config.firebaseProjectId}`;
  const app = getApps().find((candidate) => candidate.name === name)
    || initializeApp({ credential: cert(serviceAccount), projectId: config.firebaseProjectId }, name);
  cached = createQaFirebaseAdmin({ auth: getAuth(app), firestore: getFirestore(app) });
  return cached;
};

module.exports = { createQaFirebaseAdmin, getQaFirebaseAdmin };
