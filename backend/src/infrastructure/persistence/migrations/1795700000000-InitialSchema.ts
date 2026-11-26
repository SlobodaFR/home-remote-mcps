import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema as created by `synchronize: true` until now. IF NOT EXISTS everywhere: on the existing
 * production database this migration changes nothing and only records itself; on an empty
 * database it creates the schema. Hand-written: raw `migration:generate` output (no IF NOT
 * EXISTS) would crash on the production database.
 *
 * The trailing space after the index column lists is what TypeORM writes: kept so sqlite_master
 * is byte-identical to a synchronize-built database.
 *
 * Only ever use the `queryRunner` passed in (never `dataSource.query`): migrations run on the
 * serialized connection. There is deliberately no CLI data source: `down()` drops the data.
 */
export class InitialSchema1795700000000 implements MigrationInterface {
  name = 'InitialSchema1795700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "api_keys" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "label" text NOT NULL, "hashed_key" text NOT NULL, "lookup_hash" text, "last_used_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "revoked_at" datetime)`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "credentials" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "service" text NOT NULL, "status" text NOT NULL, "encrypted_tokens" text, "last_error" text, "last_tested_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "revoked_sessions" ("user_id" text PRIMARY KEY NOT NULL, "revoked_at" datetime NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("id" text PRIMARY KEY NOT NULL, "email" text NOT NULL, "name" text NOT NULL, "avatar_url" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_2eec559a71153433086e53260e" ON "api_keys" ("lookup_hash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_c36de6901ee377ce04af4965c5" ON "credentials" ("user_id", "service") `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "revoked_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
