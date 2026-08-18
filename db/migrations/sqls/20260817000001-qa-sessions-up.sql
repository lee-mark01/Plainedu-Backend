CREATE TABLE QaSessions (
  id CHAR(36) NOT NULL,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  root_user_id INT NULL,
  expires_at DATETIME NOT NULL,
  cleanup_required BOOLEAN NOT NULL DEFAULT FALSE,
  cleanup_started_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qa_sessions_expiry (cleanup_required, created_at, expires_at, cleanup_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE Users
  ADD COLUMN qa_session_id CHAR(36) NULL,
  ADD KEY idx_users_qa_session (qa_session_id),
  ADD CONSTRAINT fk_users_qa_session
    FOREIGN KEY (qa_session_id) REFERENCES QaSessions(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Teams
  ADD COLUMN qa_session_id CHAR(36) NULL,
  ADD KEY idx_teams_qa_session (qa_session_id),
  ADD CONSTRAINT fk_teams_qa_session
    FOREIGN KEY (qa_session_id) REFERENCES QaSessions(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Teams
  ADD COLUMN qa_scope_key CHAR(36) NOT NULL DEFAULT 'production';

ALTER TABLE Teams
  ADD UNIQUE KEY uq_teams_school_name_scope (school_id, name, qa_scope_key);

ALTER TABLE Teams
  DROP INDEX uq_teams_school_name;

ALTER TABLE Topics
  ADD COLUMN level_number INT NOT NULL DEFAULT 1 AFTER title,
  ADD KEY idx_topics_level_sort (level_number, sort_order);

ALTER TABLE CommunityPosts
  ADD COLUMN qa_session_id CHAR(36) NULL,
  ADD KEY idx_community_posts_qa_session (qa_session_id),
  ADD CONSTRAINT fk_community_posts_qa_session
    FOREIGN KEY (qa_session_id) REFERENCES QaSessions(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE DailyRankings
  ADD COLUMN qa_session_id CHAR(36) NULL,
  ADD KEY idx_daily_rankings_qa_session (qa_session_id),
  ADD CONSTRAINT fk_daily_rankings_qa_session
    FOREIGN KEY (qa_session_id) REFERENCES QaSessions(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE DailyRankings
  ADD COLUMN qa_scope_key CHAR(36) NOT NULL DEFAULT 'production';

ALTER TABLE DailyRankings
  ADD UNIQUE KEY uq_dr_target_date_scope
    (target_type, target_id, rank_date, season_id, qa_scope_key);

ALTER TABLE DailyRankings
  DROP INDEX uq_dr_target_date;
