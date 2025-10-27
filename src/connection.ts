import { ConnectionOptions } from "bullmq";
import { Cluster } from "ioredis";

export function parseRedisConnectionString(uri: string) {
  // Split protocol://rest
  const [proto, rest] = uri.split("://");
  const tls = proto === "rediss";
  // Separate “[auth@]host[:port][/db][?query]”
  const [beforeQuery, query] = rest.split("?");
  const [authAndHost, maybeDb] = beforeQuery.split("/");
  const [authPart, hostPart] = authAndHost.includes("@")
    ? beforeQuery.split("@")
    : ["", beforeQuery];
  const options: Record<string, string> = {};
  if (query) {
    for (const kv of query.split("&")) {
      const [k, v] = kv.split("=");
      options[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  // Auth might be “user:pass” or just “:pass”
  const [, password] = authPart.split(":");
  // HostPart is “hostname:port” or just “hostname”
  const [host, portRaw] = hostPart.split(":");
  const port = portRaw ? parseInt(portRaw, 10) : tls ? 6380 : 6379;
  const db = maybeDb ? parseInt(maybeDb, 10) : 0;

  return { host, port, password, db, tls, options };
}

const connectionOptions = parseRedisConnectionString(
  process.env.REDIS_CONNECTION_STRING!
);

function createConnection() {
  if (process.env.REDIS_IS_CLUSTER === "true") {
    return new Cluster(
      [
        {
          host: connectionOptions.host,
          port: connectionOptions.port,
        },
      ],
      {
        redisOptions: {
          password: connectionOptions.password,
          tls: connectionOptions.tls
            ? {
                servername: connectionOptions.host,
              }
            : undefined,
        },
        ...connectionOptions.options,
      }
    );
  }

  return {
    host: connectionOptions.host,
    port: connectionOptions.port,
    redisOptions: {
      password: connectionOptions.password,
      tls: connectionOptions.tls ? { servername: connectionOptions.host } : undefined,
    }
  } as ConnectionOptions;
}

const defaultConnection: ConnectionOptions = createConnection();

export default defaultConnection;
