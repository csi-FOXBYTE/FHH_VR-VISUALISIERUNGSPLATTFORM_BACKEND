import { Prisma, PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";

/** Returns the current change tracking version. */
async function getCurrentVersion(prismaClient: {
  $queryRawUnsafe: PrismaClient["$queryRawUnsafe"];
}) {
  const result: { currentVersion: bigint }[] =
    await prismaClient.$queryRawUnsafe(
      `SELECT CHANGE_TRACKING_CURRENT_VERSION() AS currentVersion`
    );
  return result[0].currentVersion;
}

async function setupDB(
  prismaClient: {
    $executeRawUnsafe: PrismaClient["$executeRawUnsafe"];
  },
  databaseName: string,
  modelDbNameMap: Map<string, string>
) {
  try {
    await prismaClient.$executeRawUnsafe(`
ALTER DATABASE [${databaseName}]
SET CHANGE_TRACKING = ON
(CHANGE_RETENTION = 5 MINUTES, AUTO_CLEANUP = ON);
    `);
  } catch {}
  // Enable change tracking for each model/table.
  for (const value of modelDbNameMap.values()) {
    try {
      await prismaClient.$executeRawUnsafe(`
ALTER TABLE dbo.[${value}]
ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = ON);
      `);
    } catch {}
  }
}

/** Returns changes for each table since the given version. */
async function getChanges(
  tables: Iterable<string>,
  prismaClient: {
    $queryRawUnsafe: PrismaClient["$queryRawUnsafe"];
    $executeRawUnsafe: PrismaClient["$executeRawUnsafe"];
  },
  lastVersion: bigint,
  databaseName: string,
  modelDbNameMap: Map<string, string>
) {
  const queries: {
    operation: string;
    result: { SYS_CHANGE_OPERATION: string; id: string }[];
  }[] = [];
  for (const table of Array.from(tables)) {
    try {
      const recordset: { SYS_CHANGE_OPERATION: string; id: string }[] =
        await prismaClient.$queryRawUnsafe(`
DECLARE @lastVersion BIGINT = ${lastVersion};
SELECT CT.*
FROM CHANGETABLE(CHANGES dbo.[${table}], @lastVersion) AS CT;
    `);
      queries.push({ operation: table, result: recordset });
    } catch (e) {
      try {
        await setupDB(prismaClient, databaseName, modelDbNameMap);
      } catch (e) {
        console.error(JSON.stringify(e));
      }
      console.error(JSON.stringify(e));
      throw e;
    }
  }
  return queries;
}

type ChangeEmitters = EventEmitter<{
  change: [{ id: string; operation: OPERATIONS }];
}>;

type OPERATIONS = "UPDATE" | "DELETE" | "INSERT";

/**
 * Realtime extension for Prisma with mssql.
 */
export default function realtimeExtension({
  intervalMs,
}: {
  intervalMs: number;
}) {
  return Prisma.defineExtension((prismaClient) => {
    const poolRef: { lastSyncVersion: bigint; setupDB: boolean } = {
      setupDB: false,
      lastSyncVersion: BigInt(0),
    };

    // Filter models that have an ID field and create maps between model names and their DB names.
    const models = Prisma.dmmf.datamodel.models.filter((m) =>
      m.fields.some((f) => f.isId)
    );
    const modelDbNameMap = new Map(
      models.map((m) => [m.name, m.dbName ?? m.name])
    );
    const modelNameMap = new Map(
      models.map((m) => [m.dbName ?? m.name, m.name])
    );

    const databaseName = process.env
      .DATABASE_URL!.split(";")
      .find((p) => p.startsWith("database="))!
      .replace("database=", "");

    setupDB(prismaClient, databaseName, modelDbNameMap).then(() => {
      poolRef.setupDB = true;
    });

    const changeEmitters = new Map<string, ChangeEmitters>();

    for (const model of models) {
      changeEmitters.set(model.name, new EventEmitter());
    }

    /** Polls the database for changes and notifies subscribers. */
    async function pollChanges() {
      if (
        Array.from(changeEmitters.values()).every(
          (ce) => ce.listenerCount("change") === 0
        )
      )
        return;

      try {
        if (poolRef.lastSyncVersion === BigInt(0)) {
          poolRef.lastSyncVersion = await getCurrentVersion(prismaClient);
        } else {
          const changes = await getChanges(
            modelDbNameMap.values(),
            prismaClient,
            poolRef.lastSyncVersion,
            databaseName,
            modelDbNameMap
          );
          for (const { operation, result } of changes) {
            for (const change of result) {
              const { SYS_CHANGE_OPERATION, id } = change;
              const opMap: Record<string, OPERATIONS> = {
                U: "UPDATE",
                I: "INSERT",
                D: "DELETE",
              };
              const operationStr = opMap[SYS_CHANGE_OPERATION];
              if (!operationStr) continue;
              const modelName = modelNameMap.get(operation)!;
              changeEmitters
                .get(modelName)
                ?.emit("change", { id, operation: operation as OPERATIONS });
            }
          }
          poolRef.lastSyncVersion = await getCurrentVersion(prismaClient);
        }
      } catch (e) {
        console.error("c", JSON.stringify(e));
      }
    }

    async function startPolling() {
      await pollChanges();
      setTimeout(startPolling, intervalMs);
    }

    startPolling();

    return prismaClient.$extends({
      model: {
        $allModels: {
          /**
           * Allows subscribing to database changes, also allows you to filter by an id and / or an operation (e.g. UPDATE, DELETE, INSERT).
           */
          subscribe<T>(
            this: T,
            args: { id?: string; operations: (OPERATIONS | "*")[] }
          ) {
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
