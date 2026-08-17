const appendQaScope = ({ conditions, params, alias, qaSessionId }) => {
  if (qaSessionId) {
    conditions.push(`${alias}.qa_session_id = ?`);
    params.push(qaSessionId);
  } else {
    conditions.push(`${alias}.qa_session_id IS NULL`);
  }
};

module.exports = { appendQaScope };
