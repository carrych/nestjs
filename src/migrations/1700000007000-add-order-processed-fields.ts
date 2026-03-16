import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderProcessedFields1700000007000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'processed' value to order_status_enum
    await queryRunner.query(`ALTER TYPE "order_status_enum" ADD VALUE IF NOT EXISTS 'processed'`);

    // Add processed_at column to orders
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMPTZ NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "processed_at"`);
    // Note: PostgreSQL does not support removing enum values directly.
    // To remove 'processed', the enum must be recreated — skipped in down() for safety.
  }
}
