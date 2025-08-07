import { Prisma } from "@prisma/client";

type Unwrap<T> = T extends (infer U)[] ? U : never;

export function versioningExtension() {
  return Prisma.defineExtension((prismaClient) => {
    async function setupDB() {
      const modelNames = Prisma.dmmf.datamodel.models
        .filter((model) => model.fields.some((field) => field.isId))
        .map((model) => model.dbName ?? model.name);

      for (const modelName of modelNames) {
        const historyTableName = `${modelName}_history`;
        try {
          await prismaClient.$executeRawUnsafe(`
            ALTER TABLE dbo.[${modelName}]
            ADD 
                _validFrom DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL DEFAULT SYSUTCDATETIME(),
                _validTo   DATETIME2 GENERATED ALWAYS AS ROW END NOT NULL DEFAULT CONVERT(DATETIME2, '9999-12-31 23:59:59.9999999'),
                PERIOD FOR SYSTEM_TIME (_validFrom, _validTo);
        
            ALTER TABLE dbo.[${modelName}]
            SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.[${historyTableName}]));
            `);
        } catch {}
      }
    }

    setupDB();

    return prismaClient.$extends({
      model: {
        $allModels: {
          async findVersions<
            T,
            R = Unwrap<Prisma.Result<T, object, "findMany">> & {
              _validFrom: Date;
              _validTo: Date;
            }
          >(this: T) {
            const context = Prisma.getExtensionContext(this);

            try {
              const result: R[] = await prismaClient.$queryRawUnsafe(
                `SELECT * FROM dbo.[${context.$name}] FOR SYSTEM_TIME ALL;`
              );

              return result;
            } catch (e) {
              console.error(JSON.stringify(e));
              throw e;
            }
          },
        },
      },
    });
  });
}
