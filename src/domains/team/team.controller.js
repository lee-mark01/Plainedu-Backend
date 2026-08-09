const teamService = require('./team.service');

const createTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { name, max_member_count, position } = req.validated;
    const team = await teamService.createTeam(user_id, name, max_member_count, position);
    res.status(201).json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

const joinTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { join_code, position } = req.validated;
    const team = await teamService.joinTeam(user_id, join_code, position);
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

const listTeams = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const teams = await teamService.listTeams(user_id, req.validated);
    res.json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
};

const getMyTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const team = await teamService.getMyTeam(user_id);
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

module.exports = { createTeam, joinTeam, listTeams, getMyTeam };
