const { createJsonStorage } = require("./storage/json");

function createStorage(config) {
  if (config.databaseUrl) {
    const { createPostgresStorage } = require("./storage/postgres");
    return createPostgresStorage(config);
  }
  return createJsonStorage(config);
}

module.exports = { createStorage };
