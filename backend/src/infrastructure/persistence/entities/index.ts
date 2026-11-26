import { ApiKeyOrmEntity } from './api-key.orm-entity';
import { CredentialOrmEntity } from './credential.orm-entity';
import { RevokedSessionOrmEntity } from './revoked-session.orm-entity';
import { UserOrmEntity } from './user.orm-entity';

/** Single list of persisted entities: database module, migrations and tests. */
export const ENTITIES = [
  UserOrmEntity,
  RevokedSessionOrmEntity,
  CredentialOrmEntity,
  ApiKeyOrmEntity,
];
