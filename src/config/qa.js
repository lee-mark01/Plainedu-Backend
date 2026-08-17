const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createQaConfig = (env = process.env) => {
  const config = {
    enabled: env.QA_AUTH_ENABLED === 'true',
    isQaDeployment: env.QA_DEPLOYMENT_MODE === 'true',
    firebaseProjectId: env.QA_FIREBASE_PROJECT_ID?.trim() || '',
    sessionTtlHours: positiveNumber(env.QA_SESSION_TTL_HOURS, 8),
    retentionHours: positiveNumber(env.QA_DATA_RETENTION_HOURS, 24),
    qaPinGlobalLimit: positiveNumber(env.QA_PIN_GLOBAL_FAILURE_LIMIT, 50),
    pinHash: env.QA_AUTH_PIN_HASH?.trim() || '',
  };

  if (!config.enabled) return config;
  if (!config.isQaDeployment) throw new Error('QA_DEPLOYMENT_MODE=true is required when QA authentication is enabled');
  if (!config.pinHash) throw new Error('QA_AUTH_PIN_HASH is required when QA authentication is enabled');
  if (!config.firebaseProjectId) {
    throw new Error('QA_FIREBASE_PROJECT_ID is required when QA authentication is enabled');
  }

  const productionDb = env.PRODUCTION_DB_NAME?.trim() || 'plainedu';
  if ((env.DB_NAME?.trim() || '') === productionDb) {
    throw new Error('QA authentication cannot use the production database');
  }

  const productionFirebase = env.PRODUCTION_FIREBASE_PROJECT_ID?.trim() || 'plainedu-2c6b9';
  if (config.firebaseProjectId === productionFirebase) {
    throw new Error('QA authentication cannot use the production Firebase project');
  }
  if ((env.FIREBASE_PROJECT_ID?.trim() || '') !== config.firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID must match QA_FIREBASE_PROJECT_ID in a QA deployment');
  }

  return config;
};

const getQaConfig = () => createQaConfig(process.env);

module.exports = { createQaConfig, getQaConfig };
