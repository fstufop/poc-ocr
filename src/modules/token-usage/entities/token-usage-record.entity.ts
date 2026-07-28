import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('token_usage')
export class TokenUsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  endpoint: string;

  @Column({ length: 50 })
  provider: string;

  @Column({ length: 100 })
  model: string;

  @Column({ name: 'input_tokens', type: 'int' })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens: number;

  @Column({ name: 'total_tokens', type: 'int' })
  totalTokens: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
