import { ConnectionOptions } from "bullmq";

const defaultConnection: ConnectionOptions = {
  url: process.env.REDIS_CONNECTION_STRING,
};

export default defaultConnection;
