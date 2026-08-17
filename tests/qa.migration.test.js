const { test } = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../db/migrations/20260817000001-qa-sessions');

migration.setup({ dbmigrate: { dataType: {} }, Promise }, null);

test('QA session migration creates session relationships for every top-level QA aggregate', async () => {
  const statements = [];
  await migration.up({ runSql: async (sql) => statements.push(sql) });
  const sql = statements.join('\n');

  assert.match(sql, /CREATE TABLE QaSessions/i);
  assert.match(sql, /firebase_uid VARCHAR\(128\) NOT NULL UNIQUE/i);
  assert.match(sql, /cleanup_started_at DATETIME NULL/i);
  assert.match(sql, /ALTER TABLE Users[\s\S]*ADD COLUMN qa_session_id CHAR\(36\) NULL/i);
  for (const table of ['Users', 'Teams', 'CommunityPosts', 'DailyRankings']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table}[\\s\\S]*ADD COLUMN qa_session_id CHAR\\(36\\) NULL`, 'i'));
  }
  assert.equal((sql.match(/FOREIGN KEY \(qa_session_id\) REFERENCES QaSessions\(id\) ON DELETE CASCADE/gi) || []).length, 4);
  assert.match(sql, /qa_scope_key CHAR\(36\)\s+GENERATED ALWAYS AS \(COALESCE\(qa_session_id, 'production'\)\) STORED/i);
  assert.match(sql, /UNIQUE KEY uq_dr_target_date_scope\s+\(target_type, target_id, rank_date, season_id, qa_scope_key\)/i);
  assert.match(sql, /UNIQUE KEY uq_teams_school_name_scope \(school_id, name, qa_scope_key\)/i);
  assert.match(sql, /ALTER TABLE Topics[\s\S]*ADD COLUMN level_number INT NOT NULL DEFAULT 1/i);
});

test('QA session down migration removes every aggregate scope before dropping sessions', async () => {
  const statements = [];
  await migration.down({ runSql: async (sql) => statements.push(sql) });
  const sql = statements.join('\n');

  for (const table of ['Users', 'Teams', 'CommunityPosts', 'DailyRankings']) {
    assert.ok(sql.indexOf(`ALTER TABLE ${table}`) >= 0);
    assert.ok(sql.indexOf(`ALTER TABLE ${table}`) < sql.indexOf('DROP TABLE IF EXISTS QaSessions'));
  }
  assert.match(sql, /DELETE FROM QaSessions/i);
  assert.match(sql, /ADD UNIQUE KEY uq_dr_target_date \(target_type, target_id, rank_date, season_id\)/i);
  assert.match(sql, /ADD UNIQUE KEY uq_teams_school_name \(school_id, name\)/i);
});
