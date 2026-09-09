const { spawnSync } = require('node:child_process');
const path = require('node:path');

const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: { ...process.env, SEED_PRINT_ACCESS_TOKENS: 'false' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

// 순서가 중요하다: cleanup이 QA 계정을 지우면 FK CASCADE로 그 계정의 신규 기능 데이터
// (약관·알림설정·차단·신고·제재·가입신청·퀴즈·종목알림·게시글)도 함께 사라진다.
// 그래서 seed-qa-features는 계정이 다시 만들어진 뒤에 돌아야 한다.
run('cleanup-main-qa.js');
run('seed-demo.js');
run('seed-qa-features.js');
