import { ApiError } from './errors';

export interface D1Query {
  sql: string;
  params?: Array<string | number | null>;
}

export function requireDatabase(db: D1Database | undefined): D1Database {
  if (!db) {
    throw new ApiError(
      503,
      'database_unavailable',
      'D1 database binding is not configured.',
    );
  }

  return db;
}

export async function allRows<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: Array<string | number | null> = [],
): Promise<T[]> {
  const result = await bind(db, sql, params).all<T>();

  return result.results;
}

export async function firstRow<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: Array<string | number | null> = [],
): Promise<T | null> {
  const result = await bind(db, sql, params).first<T>();

  return result ?? null;
}

export async function execute(db: D1Database, query: D1Query): Promise<void> {
  await bind(db, query.sql, query.params ?? []).run();
}

export async function executeBatch(
  db: D1Database,
  queries: D1Query[],
): Promise<void> {
  await db.batch(
    queries.map((query) => bind(db, query.sql, query.params ?? [])),
  );
}

function bind(
  db: D1Database,
  sql: string,
  params: Array<string | number | null>,
): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}
