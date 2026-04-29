const userRepository = require('./user.repository');

const getUsers = async () => {
  return await userRepository.findAll();
};

module.exports = { getUsers };
