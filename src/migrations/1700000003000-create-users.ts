import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1700000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('user', 'staff', 'admin')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "email"         VARCHAR(255) NOT NULL UNIQUE,
        "password_hash" VARCHAR(255) NOT NULL,
        "role"          "user_role_enum" NOT NULL DEFAULT 'user',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_users_email" ON "users"("email")`,
    );

    // Add FK constraints to existing tables that already have user_id INT without FK
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "fk_orders_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "fk_payments_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);

    await queryRunner.query(`
      ALTER TABLE "shipping"
        ADD CONSTRAINT "fk_shipping_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shipping" DROP CONSTRAINT IF EXISTS "fk_shipping_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "fk_payments_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_user"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
  }
}
