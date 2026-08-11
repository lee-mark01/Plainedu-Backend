// env 정수값 파싱 공통 헬퍼.
// `Number(process.env.X) || fallback` 패턴은 값이 "0"일 때도 falsy라 fallback으로 대체되는
// 버그가 있다(운영자가 명시적으로 0을 넣어도 무시됨). 값이 없거나 숫자가 아닐 때만 fallback.
const parseEnvInt = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = { parseEnvInt };
