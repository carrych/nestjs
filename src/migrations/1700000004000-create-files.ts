import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFiles1700000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "file_status_enum" AS ENUM ('pending', 'ready')
    `);

    await queryRunner.query(`
      CREATE TYPE "file_visibility_enum" AS ENUM ('private', 'public')
    `);

    await queryRunner.query(`
      CREATE TABLE "files" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id"     BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "entity_type"  VARCHAR(60) NOT NULL,
        "entity_id"    VARCHAR(255) NOT NULL,
        "key"          VARCHAR(512) NOT NULL,
        "bucket"       VARCHAR(120) NOT NULL,
        "content_type" VARCHAR(120) NOT NULL,
        "size"         INTEGER,
        "status"       "file_status_enum" NOT NULL DEFAULT 'pending',
        "visibility"   "file_visibility_enum" NOT NULL DEFAULT 'private',
        "expires_at"   TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_files_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_files_owner_id" ON "files"("owner_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_files_status" ON "files"("status") WHERE "status" = 'pending'`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_files_entity" ON "files"("entity_type", "entity_id")`,
    );

    // Add image_file_id to products
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "image_file_id" UUID`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_products_image_file_id" ON "products"("image_file_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "products"
        ADD CONSTRAINT "fk_products_image_file"
        FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_image_file"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_products_image_file_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "image_file_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_files_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_files_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_files_owner_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "files"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_visibility_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_status_enum"`);
  }
}
