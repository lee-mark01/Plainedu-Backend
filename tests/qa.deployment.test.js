const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('QA compose isolates the API and Redis while using a non-production database', () => {
  const compose = fs.readFileSync('docker-compose.qa.yml', 'utf8');

  assert.match(compose, /127\.0\.0\.1:3001:3000/);
  assert.match(compose, /container_name:\s*plainedu-qa-app/);
  assert.match(compose, /container_name:\s*plainedu-qa-redis/);
  assert.match(compose, /env_file:\s*\n\s*- \.env\.qa/);
  assert.match(compose, /name:\s*plainedu-backend_default/);
  assert.doesNotMatch(compose, /container_name:\s*plainedu-mysql/);
});

test('QA deployment is manually gated and installs an HTTPS path without touching production data', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-qa.yml', 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[codex\/qa-session-implementation\]/);
  assert.match(workflow, /codex\/qa-session-implementation/);
  assert.match(workflow, /DB_NAME=plainedu_qa/);
  assert.match(workflow, /QA_AUTH_ENABLED=true/);
  assert.match(workflow, /QA_DEPLOYMENT_MODE=true/);
  assert.match(workflow, /QA_FIREBASE_PROJECT_ID=plainedu-qa-preview/);
  assert.match(workflow, /git clone "\$production_dir" "\$qa_dir"/);
  assert.doesNotMatch(workflow, /git clone[^\n]+https:\/\/github\.com/);
  assert.match(workflow, /read_env_value\(\)/);
  assert.match(workflow, /docker exec plainedu-mysql printenv MYSQL_ROOT_PASSWORD/);
  assert.match(workflow, /SHOW ENGINE INNODB STATUS/);
  assert.match(workflow, /partial_qa_schema/);
  assert.match(workflow, /DROP DATABASE plainedu_qa/);
  assert.doesNotMatch(workflow, /\. "\$production_dir\/\.env"/);
  assert.match(workflow, /location \/qa\//);
  assert.match(workflow, /proxy_pass http:\/\/127\.0\.0\.1:3001\//);
  assert.match(workflow, /for attempt in \$\(seq 1 30\)/);
  assert.match(workflow, /--data '\{"pin":"000000"\}'/);
  assert.doesNotMatch(workflow, /seed:demo/);
});
