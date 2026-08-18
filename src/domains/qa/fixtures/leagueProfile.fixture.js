const seedLeagueProfile = async (executor, { qaSessionId, now, users, catalog, investment }) => {
  const date = now.toISOString().slice(0, 10);
  await executor.query(
    `INSERT INTO DailyRankings
       (season_id, target_type, school_group, target_id, rank_date, rank_position, return_rate, final_score, participation_rate, alignment_score, qa_session_id, qa_scope_key)
     VALUES
       (?, 'USER', 'HIGH_SCHOOL', ?, ?, 1, 5.0000, 5.0000, 80, NULL, ?, ?),
       (?, 'USER', 'HIGH_SCHOOL', ?, ?, 2, 3.5000, 3.5000, 70, NULL, ?, ?),
       (?, 'USER', 'HIGH_SCHOOL', ?, ?, 3, 2.0000, 2.0000, 60, NULL, ?, ?),
       (?, 'TEAM', 'HIGH_SCHOOL', ?, ?, 1, 8.0000, 15.0000, 75, 78, ?, ?),
       (?, 'SCHOOL_INDIVIDUAL', 'HIGH_SCHOOL', ?, ?, 1, 3.5000, 3.5000, NULL, NULL, ?, ?),
       (?, 'SCHOOL_TEAM', 'HIGH_SCHOOL', ?, ?, 1, 8.0000, 15.0000, NULL, NULL, ?, ?)`,
    [
      catalog.seasonId, users[0].id, date, qaSessionId, qaSessionId,
      catalog.seasonId, users[1].id, date, qaSessionId, qaSessionId,
      catalog.seasonId, users[3].id, date, qaSessionId, qaSessionId,
      catalog.seasonId, investment.teamId, date, qaSessionId, qaSessionId,
      catalog.seasonId, catalog.schoolId, date, qaSessionId, qaSessionId,
      catalog.seasonId, catalog.schoolId, date, qaSessionId, qaSessionId,
    ]
  );
};

module.exports = { seedLeagueProfile };
