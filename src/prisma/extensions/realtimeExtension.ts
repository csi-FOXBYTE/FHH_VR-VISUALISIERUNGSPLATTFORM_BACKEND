import "dotenv/config";
import { Prisma } from "@prisma/client";
import { EventEmitter } from "events";
import { createClient, RedisClientType } from "redis";
import { withNestedOperations } from "prisma-extension-nested-operations";

type ChangeEmitters = EventEmitter<{
  change: [{ operation: OPERATIONS }];
}>;

function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      // @ts-expect-error wrong type
      setTimeout(() => func.apply(this as any, args), delay);
    }
  };
}

function uncapitalize(value: string) {
  return `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

let pub: RedisClientType | null = null;
function getPub() {
  if (!pub) {
    pub = createClient({
      url: process.env.REDIS_CONNECTION_STRING,
      socket: {
        reconnectStrategy(retries) {
          return Math.min(retries * 50, 5_000);
        },
      },
    });
    pub.connect();
  }
  return pub;
}
let sub: RedisClientType | null = null;
function getSub() {
  if (!sub) {
    sub = createClient({
      url: process.env.REDIS_CONNECTION_STRING,
      socket: {
        reconnectStrategy(retries) {
          return Math.min(retries * 50, 5_000);
        },
      },
    });
    sub.connect();
  }
  return sub;
}

type OPERATIONS = "UPDATE" | "DELETE" | "INSERT";

/**
 * Realtime extension for Prisma with mssql.
 */
export default function realtimeExtension() {
  return Prisma.defineExtension((prismaClient) => {
    const pub = getPub();
    const sub = getSub();

    async function emitChangeEvent(operation: OPERATIONS, model: string) {
      await pub.publish(
        `changeEvents:${model}`,
        JSON.stringify({ operation, model })
      );
    }

    const changeEmitters = new Map<string, ChangeEmitters>();

    for (const model of Prisma.dmmf.datamodel.models) {
      const emitter: ChangeEmitters = new EventEmitter();
      changeEmitters.set(model.name, emitter);

      const throttledEmit = throttle((message: string) => {
        emitter.emit("change", JSON.parse(message));
      }, 5_000);

      sub.subscribe(`changeEvents:${uncapitalize(model.name)}`, throttledEmit);
    }

    return prismaClient.$extends({
      query: {
        $allModels: {
          $allOperations: withNestedOperations({
            async $rootOperation(params) {
              const result = await params.query(params.args);

              switch (params.operation) {
                // create
                case "createManyAndReturn":
                case "create":
                case "createMany":
                  await emitChangeEvent("INSERT", uncapitalize(params.model));
                  break;
                //delete
                case "delete":
                case "deleteMany":
                  await emitChangeEvent("DELETE", uncapitalize(params.model));
                  break;
                //update
                case "update":
                case "updateMany":
                case "updateManyAndReturn":
                case "upsert":
                  await emitChangeEvent("UPDATE", uncapitalize(params.model));
                  break;
              }

              return result;
            },
            async $allNestedOperations(params) {
              const result = await params.query(params.args);

              switch (params.operation) {
                // create
                case "connect":
                case "connectOrCreate":
                case "create":
                case "createMany":
                  await emitChangeEvent("INSERT", uncapitalize(params.model));
                  break;
                //delete
                case "delete":
                case "deleteMany":
                case "disconnect":
                  await emitChangeEvent("DELETE", uncapitalize(params.model));
                  break;
                //update
                case "update":
                case "updateMany":
                case "upsert":
                  await emitChangeEvent("UPDATE", uncapitalize(params.model));
                  break;
              }

              return result;
            },
          }),
        },
      },
      model: {
        $allModels: {
          /**
           * Allows subscribing to database changes, also allows you to filter by an id and / or an operation (e.g. UPDATE, DELETE, INSERT).
           */
          subscribe<T>(this: T) {
            const context = Prisma.getExtensionContext(this) as {
              $name: Prisma.ModelName;
            };
            const modelName = context.$name;

            const changeEmitter = changeEmitters.get(modelName);

            if (!changeEmitter)
              throw new Error(`No emitter for ${modelName} found!`);

            return changeEmitter;
          },
        },
      },
    });
  });
}
