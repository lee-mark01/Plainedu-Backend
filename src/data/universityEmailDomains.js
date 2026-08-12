const domains = require('./universityEmailDomains.json');
const domainSet = new Set(domains.map((d) => d.toLowerCase()));

const isUniversityEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? domainSet.has(domain) : false;
};

module.exports = { isUniversityEmail };
