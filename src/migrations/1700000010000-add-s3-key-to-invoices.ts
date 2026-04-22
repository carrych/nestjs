import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddS3KeyToInvoices1700000010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS s3_key TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices DROP COLUMN IF EXISTS s3_key
    `);
  }
}
