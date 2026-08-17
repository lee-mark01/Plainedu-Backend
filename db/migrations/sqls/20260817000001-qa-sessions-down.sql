ALTER TABLE Users
  DROP FOREIGN KEY fk_users_qa_session,
  DROP INDEX idx_users_qa_session,
  DROP COLUMN qa_session_id;

DROP TABLE IF EXISTS QaSessions;
