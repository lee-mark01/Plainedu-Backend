const { ensureCatalog } = require('./catalog.fixture');
const { seedProfileHome } = require('./profileHome.fixture');
const { seedLearning } = require('./learning.fixture');
const { seedInvestment } = require('./investment.fixture');
const { seedCommunity } = require('./community.fixture');
const { seedLeagueProfile } = require('./leagueProfile.fixture');

const seedQaFixtures = async (executor, context) => {
  const catalog = await ensureCatalog(executor, context);
  const profile = await seedProfileHome(executor, { ...context, catalog });
  await seedLearning(executor, { ...context, ...profile, catalog });
  const investment = await seedInvestment(executor, { ...context, ...profile, catalog });
  await seedCommunity(executor, { ...context, ...profile, catalog, investment });
  await seedLeagueProfile(executor, { ...context, ...profile, catalog, investment });
  return {
    rootUserId: profile.rootUserId,
    email: profile.email,
    displayName: profile.displayName,
  };
};

module.exports = { seedQaFixtures };
