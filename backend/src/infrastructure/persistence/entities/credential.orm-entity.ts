import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'credentials' })
@Index(['userId', 'service'], { unique: true })
export class CredentialOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column('text')
  service!: string;

  @Column('text')
  status!: string;

  @Column({ type: 'text', name: 'encrypted_tokens', nullable: true })
  encryptedTokens!: string | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null;

  @Column({ type: 'datetime', name: 'last_tested_at', nullable: true })
  lastTestedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;
}
