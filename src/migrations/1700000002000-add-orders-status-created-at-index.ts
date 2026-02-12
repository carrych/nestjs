import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdersStatusCreatedAtIndex1700000002000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_orders_status_created_at" ON "orders" ("status", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_orders_status_created_at"`,
    );
  }
}
