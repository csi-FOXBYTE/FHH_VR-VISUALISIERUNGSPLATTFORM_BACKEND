import { PrismaClient } from '@prisma/client';

export async function resetSystemVersionedTables() {
  const prismaClient = new PrismaClient();

  const modelNamesSys = await prismaClient.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sys.tables;`,
  );

  const modelNames = modelNamesSys
    .filter(d => !d.name.endsWith('_history'))
    .map(d => d.name);

  for (const modelName of modelNames) {
    try {
      await prismaClient.$queryRawUnsafe(`
        ALTER TABLE dbo.[${modelName}]
        SET (SYSTEM_VERSIONING = OFF);
        `);
    } catch (e) {
      console.error(JSON.stringify(e));
    }
  }
}

resetSystemVersionedTables().then(() => console.log('FINISHED'));
