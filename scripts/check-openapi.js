#!/usr/bin/env node
// docs/openapi.yaml 드리프트 검사 — `npm run check:openapi`
//
// 1) YAML 파싱 + 모든 $ref 해석 확인
// 2) 실제 Express 라우트와 스펙 경로 양방향 대조 (누락 / 유령 경로)
//
// 라우터를 require하면 config/redis가 재접속 클라이언트를 열어 프로세스가 종료되지 않으므로
// app.js·라우터 파일을 정적 파싱한다 (DB·Redis 없이 CI에서 그냥 돈다).
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const SPEC_PATH = path.join(ROOT, 'docs/openapi.yaml');

// 스펙에서 하나로 합쳐 기술한 경로 → 실제 라우트들. 합칠 때마다 여기 등록한다.
const EXPANDED = {
  'GET /auth/:provider/callback': [
    'GET /auth/kakao/callback',
    'GET /auth/naver/callback',
  ],
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const collectRefs = (node, at, out) => {
  if (Array.isArray(node)) return node.forEach((v, i) => collectRefs(v, `${at}[${i}]`, out));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref') out.push([v, at]);
      else collectRefs(v, `${at}.${k}`, out);
    }
  }
};

// app.js의 마운트 정보 + 각 라우터 파일을 읽어 "METHOD /full/path" 집합을 만든다
const collectRoutes = () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  const routes = new Set();

  for (const [, m, p] of appSrc.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)) {
    routes.add(`${m.toUpperCase()} ${p}`);
  }

  const requires = Object.fromEntries(
    [...appSrc.matchAll(/const (\w+) = require\('(\.\/domains\/[^']+router)'\)/g)].map(([, v, f]) => [v, f])
  );
  for (const [, prefix, varName] of appSrc.matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)) {
    const src = fs.readFileSync(path.join(ROOT, 'src', `${requires[varName]}.js`), 'utf8');
    for (const [, m, p] of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      routes.add(`${m.toUpperCase()} ${(prefix + p).replace(/\/$/, '') || prefix}`);
    }
  }
  return routes;
};

const main = () => {
  const spec = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));
  let fail = 0;

  const refs = [];
  collectRefs(spec, '', refs);
  for (const [ref, at] of refs) {
    let cur = spec;
    for (const p of ref.replace(/^#\//, '').split('/')) cur = cur?.[p];
    if (cur === undefined) {
      console.error(`  ✗ 해석 불가 $ref: ${ref} (at ${at})`);
      fail += 1;
    }
  }
  console.log(`$ref ${refs.length}개 검사 — ${fail ? `실패 ${fail}건` : 'OK'}`);

  const routes = collectRoutes();
  const specOps = new Set();
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) if (item[m]) specOps.add(`${m.toUpperCase()} ${p.replace(/\{(\w+)\}/g, ':$1')}`);
  }
  const declared = new Set();
  for (const op of specOps) (EXPANDED[op] || [op]).forEach((o) => declared.add(o));

  const missing = [...routes].filter((r) => !declared.has(r)).sort();
  const ghost = [...declared].filter((o) => !routes.has(o)).sort();

  console.log(`라우트 ${routes.size}개 / 스펙 ${specOps.size}개(전개 후 ${declared.size}개)`);
  if (missing.length) console.error('\n스펙에 없는 라우트 (문서화 필요):\n' + missing.map((r) => '  - ' + r).join('\n'));
  if (ghost.length) console.error('\n코드에 없는 스펙 경로 (삭제/수정 필요):\n' + ghost.map((r) => '  - ' + r).join('\n'));

  fail += missing.length + ghost.length;
  console.log(fail ? `\n❌ openapi.yaml 드리프트 ${fail}건` : '\n✅ openapi.yaml 이 코드와 일치');
  process.exit(fail ? 1 : 0);
};

main();
