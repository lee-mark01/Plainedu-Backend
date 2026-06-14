require('dotenv').config();

const app = require('./app');
const tokenCleanup = require('./jobs/tokenCleanup');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  tokenCleanup.start();
});
