const mongoose = require("mongoose");
const { env } = require("../config/env");

async function connectToMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: false,
  });
}

module.exports = { connectToMongo };

