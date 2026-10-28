import { Prisma } from '@prisma/client';

export class DatabaseSchemaMismatchError extends Error {
  readonly code = 'DATABASE_SCHEMA_OUTDATED';
  constructor(readonly missing: string[]) {
    super(`Database schema is out of date. Missing: ${missing.join(', ')}. Run npm run migrate:deploy in backend, then restart the backend. Do not reset the database.`);
    this.name = 'DatabaseSchemaMismatchError';
  }
}

/** Read only catalog checks; never migrate or alter data using runtime credentials. */
export async function assertDatabaseSchemaReady(db: Pick<Prisma.TransactionClient, '$queryRaw'>) {
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`;
  const present = new Set(columns.map(column => `${column.table_name}.${column.column_name}`));
  const missing: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind === 'object') continue;
      const key = `${model.dbName ?? model.name}.${field.dbName ?? field.name}`;
      if (!present.has(key)) missing.push(key);
    }
  }
  const labels = await db.$queryRaw<{ enum_name: string; enum_value: string }[]>`
    SELECT t.typname AS enum_name, e.enumlabel AS enum_value
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema()`;
  const availableLabels = new Set(labels.map(label => `${label.enum_name}.${label.enum_value}`));
  for (const enumeration of Prisma.dmmf.datamodel.enums) {
    for (const value of enumeration.values) {
      const key = `${enumeration.dbName ?? enumeration.name}.${value.dbName ?? value.name}`;
      if (!availableLabels.has(key)) missing.push(key);
    }
  }
  if (missing.length) throw new DatabaseSchemaMismatchError(missing);
}
