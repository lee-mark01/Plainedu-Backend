const { insert } = require('./sql');

const seedProfileHome = async (executor, { qaSessionId, firebaseUid, now, catalog }) => {
  const suffix = qaSessionId.slice(0, 8);
  const users = [];
  const definitions = [
    { email: `qa-${firebaseUid}@qa.invalid`, name: 'QA 테스터', provider: 'firebase', snsId: firebaseUid, position: 'TRADER' },
    { email: `qa-peer1-${suffix}@qa.invalid`, name: 'QA 애널리스트', provider: 'qa', snsId: `peer1-${qaSessionId}`, position: 'ANALYST' },
    { email: `qa-peer2-${suffix}@qa.invalid`, name: 'QA 팀원', provider: 'qa', snsId: `peer2-${qaSessionId}`, position: 'ANALYST' },
    { email: `qa-rival-${suffix}@qa.invalid`, name: 'QA 라이벌', provider: 'qa', snsId: `rival-${qaSessionId}`, position: 'NONE' },
  ];

  for (const definition of definitions) {
    const id = await insert(
      executor,
      `INSERT INTO Users
         (email, nickname, role, position, provider, sns_id, school_id, region, school_is_verified, qa_session_id)
       VALUES (?, ?, 'USER', ?, ?, ?, ?, 'QA', TRUE, ?)`,
      [definition.email, definition.name, definition.position, definition.provider, definition.snsId, catalog.schoolId, qaSessionId]
    );
    users.push({ ...definition, id });
  }

  const root = users[0];
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    await executor.query(
      `INSERT INTO Attendances
         (user_id, attendance_date, consecutive_days, total_learning_days, last_active_date)
       VALUES (?, ?, ?, ?, ?)`,
      [root.id, date, 5 - offset, 12 - offset, date]
    );
  }
  await executor.query(
    'INSERT INTO UserPoints (user_id, current_points, total_earned) VALUES (?, 1250, 2100)',
    [root.id]
  );
  await executor.query(
    `INSERT INTO PointLogs (user_id, change_amount, balance_after, reason, created_at)
     VALUES (?, 100, 1250, 'ATTENDANCE', ?)`,
    [root.id, now]
  );

  return {
    rootUserId: root.id,
    email: root.email,
    displayName: root.name,
    users,
  };
};

module.exports = { seedProfileHome };
