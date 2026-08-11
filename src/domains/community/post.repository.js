// TODO: 레포지토리 구현
const pool = require('../../config/db');

// 게시글 저장
const save = async (user_id, post_type, stock_code, opinion, title, content) => {
  const [result] = await pool.query(
    'INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content) VALUES (?, ?, ?, ?, ?, ?)',
    [user_id, post_type, stock_code, opinion, title, content]
  );

    return result.insertId;
};

// 게시글 수정
const update = async (id, fields) => {
    const keys = Object.keys(fields);
    const setClause = keys.map(k => `${k} = ?`).join(',');
    const values = keys.map(k => fields[k]);
    await pool.query(
      `UPDATE CommunityPosts SET ${setClause},
  updated_at = NOW() WHERE id = ?`,
      [...values, id]
  );
};


// 게시글 소프트 딜리트
const softDelete = async (id) => {
    await pool.query(
      'UPDATE CommunityPosts SET deleted_at = NOW() WHERE id = ?',
      [id]
  );
};

// 단일 게시글 조회
const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM CommunityPosts WHERE id = ? AND deleted_at IS NULL', [id]);
  return rows[0];
};

// cursor 기반 페이지네이션
const findByCursor = async ({ cursor, limit, post_type, stock_code, keyword, search_type, user_id }) => {
  // 삭제된 글은 목록에 노출하지 않는다 (findById·hot·스크랩 목록과 동일 정책)
  const conditions = ['p.deleted_at IS NULL'];
  const params = [];
  let join = '';

  if (cursor) {
    conditions.push('p.id < ?');
    params.push(cursor);
  }
  if (post_type) {
    conditions.push('p.post_type = ?');
    params.push(post_type);
  }
  if (stock_code) {
    conditions.push('p.stock_code = ?');
    params.push(stock_code);
  }
  if (user_id) {
    conditions.push('p.user_id = ?');
    params.push(user_id);
  }

  if (keyword && search_type) {
      if (search_type === 'TITLE') {
        conditions.push('p.title LIKE ?');
        params.push(`%${keyword}%`);
      } else if (search_type === 'CONTENT') {
        conditions.push('p.content LIKE ?');
        params.push(`%${keyword}%`);
      } else if (search_type === 'AUTHOR') {
        join = 'JOIN Users u ON p.user_id = u.id';
        conditions.push('u.nickname LIKE ?'); // Users에 name 컬럼은 없다
        params.push(`%${keyword}%`);
      }
    }

  const whereClause = conditions.length > 0 ? `WHERE
  ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT p.* FROM CommunityPosts p ${join} ${whereClause} ORDER
  BY p.id DESC LIMIT ?`,
      [...params, limit]
    );
    return rows;
  };

module.exports = { save, findById, findByCursor, update, softDelete };