// Redis 실시간 순위판 (스펙 §7) — ZSET/meta 읽기·쓰기 전담, 점수 계산은 모름
const redis = require('../../config/redis');

// board: 'individual' | 'team' | 'school:individual' | 'school:team'
const boardKey = (seasonId, board) => `rank:${seasonId}:${board}`;
const metaKey = (seasonId) => `rank:${seasonId}:meta`;

// 순위판 동기화: ZADD 일괄 갱신 + 탈락 멤버 제거 + meta에 board별 updated_at.
// protectedMembers(가격 실패로 skipped된 계좌)는 제거하지 않고 직전 점수를 유지한다 (스펙 D4).
const syncBoard = async (seasonId, board, entries, { protectedMembers = new Set(), updatedAt } = {}) => {
  const key = boardKey(seasonId, board);
  const existing = await redis.zrange(key, 0, -1);
  const next = new Set(entries.map((e) => String(e.member)));
  const toRemove = existing.filter((m) => !next.has(m) && !protectedMembers.has(m));

  const pipeline = redis.pipeline();
  if (toRemove.length) pipeline.zrem(key, ...toRemove);
  if (entries.length) pipeline.zadd(key, ...entries.flatMap((e) => [e.score, String(e.member)]));
  pipeline.hset(metaKey(seasonId), board, updatedAt ?? new Date().toISOString());
  await pipeline.exec();

  return { written: entries.length, removed: toRemove.length };
};

// 전체 인원 수 (페이지네이션 total)
const getCount = (seasonId, board) => redis.zcard(boardKey(seasonId, board));

// 순위판 페이지 조회: offset부터 limit개, 점수 내림차순. rank는 ZSET상의 1차 정렬 순번(동점 재정렬 전)
const getPage = async (seasonId, board, offset, limit) => {
  const raw = await redis.zrevrange(boardKey(seasonId, board), offset, offset + limit - 1, 'WITHSCORES');
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ member: raw[i], score: Number(raw[i + 1]), rank: offset + i / 2 + 1 });
  }
  return entries;
};

// 순위판 전체 조회 (일일 스냅샷용) — 점수 내림차순 전 멤버. ZSET 크기는 시즌 참가자 수 규모라 허용
const getAllEntries = async (seasonId, board) => {
  const raw = await redis.zrevrange(boardKey(seasonId, board), 0, -1, 'WITHSCORES');
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ member: raw[i], score: Number(raw[i + 1]) });
  }
  return entries;
};

// 특정 멤버의 순위/점수 (없으면 null — 미참여 또는 아직 미계산)
const getRank = async (seasonId, board, member) => {
  const key = boardKey(seasonId, board);
  const [rank, score] = await Promise.all([
    redis.zrevrank(key, String(member)),
    redis.zscore(key, String(member)),
  ]);
  if (rank == null || score == null) return null;
  return { rank: rank + 1, score: Number(score) };
};

const getUpdatedAt = (seasonId, board) => redis.hget(metaKey(seasonId), board);

// 동점 그룹 처리용: 이 점수보다 엄격히 높은 멤버 수(= 동점 무관 확정 순위 앞자리)
const countAbove = (seasonId, board, score) => redis.zcount(boardKey(seasonId, board), `(${score}`, '+inf');

// 정확히 이 점수인 멤버 전원 (동점 그룹 — 참여율/출석일로 재정렬할 대상)
const getMembersAtScore = (seasonId, board, score) =>
  redis.zrangebyscore(boardKey(seasonId, board), score, score);

module.exports = {
  boardKey,
  metaKey,
  syncBoard,
  getCount,
  getPage,
  getAllEntries,
  getRank,
  getUpdatedAt,
  countAbove,
  getMembersAtScore,
};
