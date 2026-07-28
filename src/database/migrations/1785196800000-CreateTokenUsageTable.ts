import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTokenUsageTable1785196800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'token_usage',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'endpoint', type: 'varchar', length: '255' },
          { name: 'provider', type: 'varchar', length: '50' },
          { name: 'model', type: 'varchar', length: '100' },
          { name: 'input_tokens', type: 'integer' },
          { name: 'output_tokens', type: 'integer' },
          { name: 'total_tokens', type: 'integer' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('token_usage');
  }
}
