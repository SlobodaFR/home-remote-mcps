import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'api_keys' })
export class ApiKeyOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column('text')
  label!: string;

  @Column({ type: 'text', name: 'hashed_key' })
  hashedKey!: string;

  @Index()
  @Column({ type: 'text', name: 'lookup_hash', nullable: true })
  lookupHash!: string | null;

  @Column({ type: 'datetime', name: 'last_used_at', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'datetime', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}
