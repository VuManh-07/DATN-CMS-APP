import mongoose from "mongoose";
import os from "os";
import process from "process";

const _SECONDS = 200000;

// count connect
const countConnect = () => {
  const numConnection = mongoose.connections.length;
  console.log("Number connect", numConnection);
};

//check over load
const checkOverload = () => {
  setInterval(() => {
    const numConnections = mongoose.connections.length;
    const numCores = os.cpus().length;
    const memoryUsage = process.memoryUsage().rss;
    //example maximum number of connections based on number osf cores
    const maxConnections = numCores * 5;

    console.log(`Active connections: ${numConnections}`);
    console.log(`Memory usage: ${memoryUsage / 1024 / 1024} MB`);

    if (numConnections > maxConnections) {
      console.log(`Connection overload detected`);
    }
  }, _SECONDS); // monitor every 2p
};

export { countConnect, checkOverload };
