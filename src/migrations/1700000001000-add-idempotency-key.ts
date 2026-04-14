import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKey1700000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "idempotency_key" VARCHAR(120)`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_orders_idempotency_key" ON "orders" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "idempotency_key"`);
  }
}
