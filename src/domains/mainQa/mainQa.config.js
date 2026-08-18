const QA_USER_EMAIL = 'dummy.leader@test.com';

const getMainQaConfig = () => ({
  enabled: process.env.MAIN_QA_AUTH_ENABLED === 'true',
  pinHash: process.env.MAIN_QA_AUTH_PIN_HASH?.trim() || '',
  userEmail: QA_USER_EMAIL,
  sessionTtlHours: 8,
});

module.exports = { getMainQaConfig, QA_USER_EMAIL };
