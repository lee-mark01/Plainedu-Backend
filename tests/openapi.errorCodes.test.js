// AppError 코드가 OpenAPI에 문서화돼 있는지 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// check:openapi는 **경로만** 대조한다. 코드에서 던지는 오류 코드가 문서에 없으면
// 프론트는 그 코드로 분기할 수 없는데도 검사를 통과한다(2026-09-09에 실제로 4건 누락).
// 여기서 코드→문서 방향을 막는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const walk = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith('.js')) acc.push(p);
  }
  return acc;
};

test('던지는 모든 오류 코드가 OpenAPI에 적혀 있다', () => {
  const spec = fs.readFileSync(path.join(root, 'docs/openapi.yaml'), 'utf8');
  const sources = walk(path.join(root, 'src'));

  // 코드는 AppError의 마지막 인자다. 중간 문자열 리터럴을 잡지 않도록 위치를 고정한다.
  const found = new Map(); // code → 처음 발견된 파일
  for (const file of sources) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/AppError\([^;]*?,\s*'([A-Z][A-Z_0-9]{3,})'\s*\)/g)) {
      if (!found.has(m[1])) found.set(m[1], path.relative(root, file));
    }
  }

  assert.ok(found.size > 20, `오류 코드를 ${found.size}개만 찾았다 — 정규식이 깨졌을 수 있다`);

  const undocumented = [...found].filter(([code]) => !spec.includes(`\`${code}\``));
  assert.deepEqual(
    undocumented.map(([code, file]) => `${code} (${file})`),
    [],
    'openapi.yaml에 백틱으로 감싼 코드 표기가 없다'
  );
});
