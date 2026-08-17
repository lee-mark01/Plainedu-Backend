const db = require('../../config/db');
const { getQaConfig } = require('../../config/qa');
const repository = require('./qa.repository');
const { getQaFirebaseAdmin } = require('./firebaseAdmin');
const { verifyQaPin } = require('./qa.pin');
const { createQaSessionService } = require('./qa.service');
const { seedQaFixtures } = require('./fixtures');

const getQaSessionService = () => {
  const config = getQaConfig();
  return createQaSessionService({
    config,
    repository,
    firebaseAdmin: config.enabled ? getQaFirebaseAdmin(config) : null,
    verifyPin: verifyQaPin,
    seedFixtures: seedQaFixtures,
    withTransaction: db.withTransaction,
  });
};

module.exports = { getQaSessionService };
