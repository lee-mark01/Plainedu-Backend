DELETE FROM QaSessions;

ALTER TABLE DailyRankings
  DROP INDEX uq_dr_target_date_scope,
  DROP COLUMN qa_scope_key;

ALTER TABLE DailyRankings
  DROP FOREIGN KEY fk_daily_rankings_qa_session,
  DROP INDEX idx_daily_rankings_qa_session,
  DROP COLUMN qa_session_id,
  ADD UNIQUE KEY uq_dr_target_date (target_type, target_id, rank_date, season_id);

ALTER TABLE CommunityPosts
  DROP FOREIGN KEY fk_community_posts_qa_session,
  DROP INDEX idx_community_posts_qa_session,
  DROP COLUMN qa_session_id;

ALTER TABLE Topics
  DROP INDEX idx_topics_level_sort,
  DROP COLUMN level_number;

ALTER TABLE Teams
  ADD UNIQUE KEY uq_teams_school_name (school_id, name);

ALTER TABLE Teams
  DROP INDEX uq_teams_school_name_scope,
  DROP COLUMN qa_scope_key,
  DROP FOREIGN KEY fk_teams_qa_session,
  DROP INDEX idx_teams_qa_session,
  DROP COLUMN qa_session_id;

ALTER TABLE Users
  DROP FOREIGN KEY fk_users_qa_session,
  DROP INDEX idx_users_qa_session,
  DROP COLUMN qa_session_id;

DROP TABLE IF EXISTS QaSessions;
