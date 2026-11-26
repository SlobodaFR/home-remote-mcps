import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
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
});
