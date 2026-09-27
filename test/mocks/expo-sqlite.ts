/**
 * Doble de expo-sqlite: SQLite REAL en memoria (sql.js, build asm.js puro,
 * sin binarios nativos → funciona en Termux/CI). Mismas firmas async que la
 * API de expo-sqlite que usa PersistenceService: execAsync, runAsync,
 * getFirstAsync, getAllAsync. Triggers, índices y transacciones son los de
 * SQLite de verdad (el ledger append-only se prueba contra el motor real).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { Database, SqlJsStatic, SqlValue } from "sql.js";

const initSqlJs: (cfg?: object) => Promise<SqlJsStatic> = require("sql.js/dist/sql-asm.js");

let sqlPromise: Promise<SqlJsStatic> | null = null;
const getSql = () => (sqlPromise ??= initSqlJs());

type Param = string | number | null | boolean | undefined | Uint8Array;

function norm(params: Param[] | Param | undefined): SqlValue[] {
  const list = params === undefined ? [] : Array.isArray(params) ? params : [params];
  return list.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p)) as SqlValue[];
}

export class FakeSQLiteDatabase {
  /** Todas las sentencias ejecutadas (para asertar "no hay escritura lateral"). */
  readonly statements: string[] = [];
  constructor(
    public readonly databaseName: string,
    public inner: Database,
  ) {}

  private rows(sql: string, params?: Param[] | Param): Record<string, unknown>[] {
    this.statements.push(sql);
    // En memoria sql.js responde "memory"; en el dispositivo el PRAGMA devuelve "wal".
    if (/^\s*PRAGMA\s+journal_mode\s*=\s*WAL/i.test(sql)) return [{ journal_mode: "wal" }];
    const stmt = this.inner.prepare(sql);
    try {
      stmt.bind(norm(params));
      const out: Record<string, unknown>[] = [];
      while (stmt.step()) out.push(stmt.getAsObject());
      return out;
    } finally {
      stmt.free();
    }
  }

  async execAsync(sql: string): Promise<void> {
    this.statements.push(sql);
    this.inner.exec(sql);
  }

  async runAsync(sql: string, ...args: (Param[] | Param)[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const params = args.length === 1 ? args[0] : (args as Param[]);
    this.rows(sql, params);
    const changes = this.inner.getRowsModified();
    const r = this.inner.exec("SELECT last_insert_rowid() AS id");
    const lastInsertRowId = Number(r[0]?.values[0]?.[0] ?? 0);
    return { changes, lastInsertRowId };
  }

  async getFirstAsync<T>(sql: string, ...args: (Param[] | Param)[]): Promise<T | null> {
    const params = args.length === 1 ? args[0] : (args as Param[]);
    return (this.rows(sql, params)[0] as T) ?? null;
  }

  async getAllAsync<T>(sql: string, ...args: (Param[] | Param)[]): Promise<T[]> {
    const params = args.length === 1 ? args[0] : (args as Param[]);
    return this.rows(sql, params) as T[];
  }

  async withTransactionAsync(work: () => Promise<void>): Promise<void> {
    this.inner.exec("BEGIN");
    try {
      await work();
      this.inner.exec("COMMIT");
    } catch (e) {
      this.inner.exec("ROLLBACK");
      throw e;
    }
  }

  async closeAsync(): Promise<void> {}
}

const registry = new Map<string, FakeSQLiteDatabase>();

export async function openDatabaseAsync(name: string): Promise<FakeSQLiteDatabase> {
  const existing = registry.get(name);
  if (existing) return existing;
  const SQL = await getSql();
  const db = new FakeSQLiteDatabase(name, new SQL.Database());
  registry.set(name, db);
  return db;
}

/** Vacía todas las bases abiertas (nuevo motor en memoria) y reaplica `schemaSql`. */
export async function __resetAll(schemaSql?: string): Promise<void> {
  const SQL = await getSql();
  for (const db of registry.values()) {
    try {
      db.inner.close();
    } catch {
      // ya cerrada
    }
    db.inner = new SQL.Database();
    db.statements.length = 0;
    if (schemaSql) db.inner.exec(schemaSql);
  }
}

export function __getDatabase(name: string): FakeSQLiteDatabase | undefined {
  return registry.get(name);
}

export type SQLiteDatabase = FakeSQLiteDatabase;
