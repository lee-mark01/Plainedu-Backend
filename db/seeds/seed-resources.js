const closeSeedResources = async ({ pool, redis }) => {
  try {
    await pool.end();
  } finally {
    redis.disconnect();
  }
};

module.exports = { closeSeedResources };
