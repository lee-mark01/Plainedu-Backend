// TODO: 컨트롤러 구현
const communityService = require('./community.service');

// 게시글 생성
const createPost = async (req, res, next) => {
  try {
    const value = req.validated; // validate 미들웨어에서 검증된 데이터
    const { user_id, post_type, stock_code, opinion, title, content } = value;
    const post = await communityService.createPost(user_id, post_type, stock_code, opinion, title, content);
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// 게시글 수정
const updatePost = async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.user_id); // TODO: 나중에 req.user.id로 교체
    const updateData = req.validated; // validate 미들웨어에서 검증된 데이터
    const post = await communityService.updatePost(postId, userId, updateData);
    res.json({ success: true, data: post });
  }
  catch (err) {
    next(err);
  }
};

// 게시글 삭제
const deletePost = async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.user_id); // TODO: 나중에 req.user.id로 교체
    await communityService.deletePost(postId, userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// 단일 게시글 조회
const getPostById = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const post = await communityService.getPostById(postId);
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// cursor 기반 페이지네이션 게시글 조회
const getPostsByCursor = async (req, res, next) => {
  try {
    const { cursor, limit } = req.validated; // validate 미들웨어에서 검증된 데이터
    const { posts, hasNext } = await communityService.getPostsByCursor(cursor, limit);
    res.json({ success: true, data: { posts, hasNext } });
  }
  catch (err) {
    next(err);
  }
};

module.exports = { createPost, getPostById, getPostsByCursor, updatePost, deletePost };
