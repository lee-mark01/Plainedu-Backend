const { test } = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../db/migrations/20260817000001-qa-sessions');

migration.setup({ dbmigrate: { dataType: {} }, Promise }, null);

test('QA session migration creates the session table and scoped user relationship', async () => {
  const statements = [];
  await migration.up({ runSql: async (sql) => statements.push(sql) });
  const sql = statements.join('\n');

  assert.match(sql, /CREATE TABLE QaSessions/i);
  assert.match(sql, /firebase_uid VARCHAR\(128\) NOT NULL UNIQUE/i);
  assert.match(sql, /cleanup_started_at DATETIME NULL/i);
  assert.match(sql, /ALTER TABLE Users[\s\S]*ADD COLUMN qa_session_id CHAR\(36\) NULL/i);
  assert.match(sql, /FOREIGN KEY \(qa_session_id\) REFERENCES QaSessions\(id\) ON DELETE CASCADE/i);
});

test('QA session down migration removes user scope before dropping sessions', async () => {
  const statements = [];
  await migration.down({ runSql: async (sql) => statements.push(sql) });
  const sql = statements.join('\n');

  assert.ok(sql.indexOf('ALTER TABLE Users') < sql.indexOf('DROP TABLE IF EXISTS QaSessions'));
});
