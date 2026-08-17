const insert = async (executor, sql, params = []) => {
  const [result] = await executor.query(sql, params);
  return result.insertId;
};

const rows = async (executor, sql, params = []) => {
  const [result] = await executor.query(sql, params);
  return result;
};

module.exports = { insert, rows };
