const { spawnSync } = require('node:child_process');
const path = require('node:path');

const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: { ...process.env, SEED_PRINT_ACCESS_TOKENS: 'false' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

run('cleanup-main-qa.js');
run('seed-demo.js');
