import { mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { InitialSchema1795700000000 } from './migrations/1795700000000-InitialSchema';

function dataSource(database: string, synchronize = false): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize,
  });
}

const tempFile = (name: string) =>
  join(mkdtempSync(join(tmpdir(), 'db-')), name);

interface MasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

// `migrations` (and sqlite_sequence, created by its AUTOINCREMENT key) only exist with migrations.
const schemaOf = (ds: DataSource): Promise<MasterRow[]> =>
  ds.query(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE tbl_name NOT IN ('migrations', 'sqlite_sequence') ORDER BY type, name`,
  );

const SAMPLE_ROWS = [
  "INSERT INTO users (id, email, name, avatar_url) VALUES ('u1', 'a@example.com', 'Alice', 'http://a'), ('u2', 'b@example.com', 'Bob', 'http://b')",
  "INSERT INTO revoked_sessions (user_id, revoked_at) VALUES ('u1', '2026-01-01 00:00:00')",
  "INSERT INTO credentials (id, user_id, service, status, encrypted_tokens, last_error, last_tested_at) VALUES ('c1', 'u1', 'garmin', 'connected', 'enc', NULL, '2026-01-02 00:00:00'), ('c2', 'u1', 'youtube', 'error', NULL, 'boom', NULL)",
  "INSERT INTO api_keys (id, user_id, label, hashed_key, lookup_hash, last_used_at, revoked_at) VALUES ('k1', 'u1', 'laptop', 'scrypt$x', 'abc', '2026-01-03 00:00:00', NULL), ('k2', 'u2', 'phone', 'scrypt$y', NULL, NULL, '2026-01-04 00:00:00')",
];
const TABLES = ['users', 'revoked_sessions', 'credentials', 'api_keys'];

async function dumpRows(ds: DataSource): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    out[table] = await ds.query(`SELECT * FROM "${table}" ORDER BY 1`);
  }
  return out;
}

describe('database migrations', () => {
  // Any entity change without its migration makes this fail.
  it('produce exactly the schema the entities describe', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();

    const pending = await ds.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
    await ds.destroy();
  });

  it('create the same sqlite_master as synchronize does (apart from the migrations table)', async () => {
    const synced = dataSource(':memory:', true);
    await synced.initialize();
    const migrated = dataSource(':memory:');
    await migrated.initialize();
    await migrated.runMigrations();

    expect(await schemaOf(migrated)).toEqual(await schemaOf(synced));
    await synced.destroy();
    await migrated.destroy();
  });

  // Production was created by synchronize: true; the first migration must adopt it untouched.
  it('adopt a database created by synchronize without losing data', async () => {
    const file = tempFile('prod.sqlite');
    const legacy = dataSource(file, true);
    await legacy.initialize();
    for (const sql of SAMPLE_ROWS) await legacy.query(sql);
    const rowsBefore = await dumpRows(legacy);
    const schemaBefore = await schemaOf(legacy);
    await legacy.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    const applied = await migrated.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual(
      MIGRATIONS.map((migration) => migration.name),
    );
    expect(await dumpRows(migrated)).toEqual(rowsBefore);
    expect(await schemaOf(migrated)).toEqual(schemaBefore);
    expect(await migrated.query('SELECT name FROM migrations')).toEqual([
      { name: 'InitialSchema1795700000000' },
    ]);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    expect(await migrated.query('PRAGMA integrity_check')).toEqual([
      { integrity_check: 'ok' },
    ]);
    await migrated.destroy();
  });

  // Production's api_keys got lookup_hash added by a later synchronize run (PR #78): the column
  // comes last there, unlike in a fresh synchronize. The migration must adopt that order untouched.
  it('adopt an api_keys table whose lookup_hash column was added last', async () => {
    const file = tempFile('prod.sqlite');
    const legacy = dataSource(file, true);
    await legacy.initialize();
    await legacy.query('DROP TABLE api_keys');
    await legacy.query(
      `CREATE TABLE "api_keys" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "label" text NOT NULL, "hashed_key" text NOT NULL, "last_used_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "revoked_at" datetime, "lookup_hash" text)`,
    );
    await legacy.query(
      `CREATE INDEX "IDX_2eec559a71153433086e53260e" ON "api_keys" ("lookup_hash") `,
    );
    for (const sql of SAMPLE_ROWS) await legacy.query(sql);
    const rowsBefore = await dumpRows(legacy);
    const schemaBefore = await schemaOf(legacy);
    await legacy.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    await migrated.runMigrations();

    expect(await dumpRows(migrated)).toEqual(rowsBefore);
    expect(await schemaOf(migrated)).toEqual(schemaBefore);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    await migrated.destroy();
  });

  it('keep the credentials unique constraint per user and service', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();
    const insert = (id: string) =>
      ds.query(
        `INSERT INTO credentials (id, user_id, service, status) VALUES ('${id}', 'u1', 'garmin', 'connected')`,
      );
    await insert('c1');

    await expect(insert('c2')).rejects.toThrow(/UNIQUE/);
    await ds.destroy();
  });

  it('make the initial migration a no-op when it runs again', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();
    const before = await schemaOf(ds);

    const queryRunner = ds.createQueryRunner();
    await new InitialSchema1795700000000().up(queryRunner);
    await queryRunner.release();

    expect(await schemaOf(ds)).toEqual(before);
    await ds.destroy();
  });

  // forFeature() with an entity missing from ENTITIES would fail at boot with "No metadata".
  it('list every @Entity file of the entities folder in ENTITIES', async () => {
    const dir = join(__dirname, 'entities');
    const declared = readdirSync(dir)
      .filter((file) => file.endsWith('.orm-entity.ts'))
      .map(
        (file) =>
          /@Entity\(\{ name: '(\w+)' \}\)/.exec(
            readFileSync(join(dir, file), 'utf8'),
          )?.[1],
      ) as string[];
    const ds = dataSource(':memory:');
    await ds.initialize();

    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(
      ds.entityMetadatas.map((meta) => meta.tableName).sort(byName),
    ).toEqual(declared.sort(byName));
    await ds.destroy();
  });

  // down() would drop every table: a mistaken migration:revert must not destroy production data.
  it('refuse to revert the baseline migration', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();
    await ds.query(SAMPLE_ROWS[0]);

    await expect(ds.undoLastMigration()).rejects.toThrow(
      /baseline migration: revert not supported, restore a backup/,
    );

    expect(await ds.query('SELECT id FROM users')).toEqual([
      { id: 'u1' },
      { id: 'u2' },
    ]);
    await ds.destroy();
  });
});
