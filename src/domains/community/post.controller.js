// TODO: 컨트롤러 구현
const communityService = require('./post.service');

// 게시글 생성
const createPost = async (req, res, next) => {
  try {
    const { post_type, stock_code, opinion, title, content } = req.validated;
    const user_id = req.user.userId;
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
    const user_id = req.user.userId;
    const updateData = req.validated;
    const post = await communityService.updatePost(postId, user_id, updateData);
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
    const user_id = req.user.userId;
    await communityService.deletePost(postId, user_id);
    res.status(200).json({ success: true, message: 'Post deleted' });
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
    const { cursor, limit, post_type, stock_code, keyword, search_type } = req.validated;
    const { posts, hasNext } = await communityService.getPostsByCursor({ cursor, limit, post_type, stock_code, keyword, search_type });
    res.json({ success: true, data: { posts, hasNext } });
  }
  catch (err) {
    next(err);
  }
};

// 내가 쓴 게시글 조회
const getMyPosts = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { cursor, limit } = req.validated;
    const { posts, hasNext } = await communityService.getPostsByCursor({ cursor, limit, user_id });
    res.json({ success: true, data: { posts, hasNext } });
  }
  catch (err) {
    next(err);
  }
};

// 종목 검색 
const searchStocks = async (req, res, next) => {
  try {
    const { keyword, limit } = req.validated; // validate 미들웨어에서 검증된 데이터
    const stocks = await communityService.searchStocks(keyword, limit);
    res.json({ success: true, data: stocks });
  }
  catch (err) {
    next(err);
  }
};

module.exports = { createPost, getPostById, getPostsByCursor, getMyPosts, updatePost, deletePost, searchStocks };
