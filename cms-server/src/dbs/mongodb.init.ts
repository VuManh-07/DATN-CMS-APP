"use strict";

import mongoose from "mongoose";
import configEnv from "../configs/config.env";
import { countConnect } from "../helpers/check.connect";

const connectStr = configEnv.mongoUri;

class Database {
  private static instance: Database;

  constructor() {
    this.connect();
  }

  connect(type: string = "mongodb") {
    // if (1 === 1) {
    //   mongoose.set("debug", true);
    //   mongoose.set("debug", { color: true });
    // }

    mongoose
      .connect(connectStr, { maxPoolSize: 50 })
      .then(() => {
        console.log("Connected to MongoDB");
        countConnect();
      })
      .catch((err) => console.log("Failed to connect to MongoDB:", err));
  }

  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }

    return Database.instance;
  }
}

const instanceMongodb = Database.getInstance();

export default instanceMongodb;
