import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  it('serializes the transactions of the production connection (issue #57)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ DATABASE_PATH: ':memory:' })],
        }),
        DatabaseModule,
      ],
    }).compile();
    await moduleRef.init();
    const dataSource = moduleRef.get(DataSource);

    // TypeORM's own driver returns one shared runner for every caller.
    expect(dataSource.createQueryRunner()).not.toBe(
      dataSource.createQueryRunner(),
    );

    await moduleRef.close();
  });

  // Wiring check: SchemaGuard must be a provider of the production module, or drift goes unnoticed.
  it('refuses to boot on a database whose schema drifted', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'drift.sqlite');
    // A complete schema plus one column no entity knows: migrations succeed, the guard must not.
    const seed = new DataSource({
      type: 'better-sqlite3',
      database: file,
      entities: ENTITIES,
      synchronize: true,
    });
    await seed.initialize();
    await seed.query('ALTER TABLE "users" ADD COLUMN "extra" text');
    await seed.destroy();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ DATABASE_PATH: file })],
        }),
        DatabaseModule,
      ],
    }).compile();

    await expect(moduleRef.init()).rejects.toThrow(
      /differs from the entities.*add a migration/,
    );

    await moduleRef.close();
  });
});
