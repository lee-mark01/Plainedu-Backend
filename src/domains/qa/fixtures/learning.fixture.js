const seedLearning = async (executor, { rootUserId, catalog }) => {
  await executor.query(
    `INSERT INTO UserShortformLog (user_id, shortform_id, is_completed, is_liked, is_saved)
     VALUES (?, ?, TRUE, TRUE, TRUE)`,
    [rootUserId, catalog.shortformId]
  );
  await executor.query(
    'INSERT INTO UserQuizLog (user_id, quiz_id, is_correct) VALUES (?, ?, TRUE)',
    [rootUserId, catalog.quizId]
  );
  await executor.query(
    `INSERT INTO UserProgress
       (user_id, topic_id, is_shortform_done, is_quiz_done, correct_count, total_quiz_count)
     VALUES (?, ?, TRUE, FALSE, 1, 2)`,
    [rootUserId, catalog.topicId]
  );
};

module.exports = { seedLearning };
