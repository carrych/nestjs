import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Products ──
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT UNIQUE NOT NULL,
        "brand" TEXT,
        "visible" BOOLEAN NOT NULL DEFAULT TRUE,
        "popular" BOOLEAN NOT NULL DEFAULT FALSE,
        "wait_for_price" BOOLEAN NOT NULL DEFAULT TRUE,
        "published" BOOLEAN NOT NULL DEFAULT TRUE,
        "short_description" TEXT,
        "description" TEXT,
        "price" NUMERIC(12, 2) DEFAULT 0.00,
        "old_price" NUMERIC(12, 2) DEFAULT 0.00,
        "special_price" NUMERIC(12, 2) DEFAULT 0.00,
        "special_price_start_date" TIMESTAMPTZ,
        "special_price_end_date" TIMESTAMPTZ,
        "youtube_url" TEXT,
        "seo_settings_id" INT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_products_slug" ON "products"("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_brand" ON "products"("brand")`,
    );

    // ── Order status enum ──
    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM (
        'pending',
        'processing',
        'complete',
        'canceled'
      )
    `);

    // ── Orders ──
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "order_number" SERIAL UNIQUE NOT NULL,
        "user_id" INT NOT NULL,
        "address_id" INT,
        "status" "order_status_enum" NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_orders_user_id" ON "orders"("user_id")`,
    );

    // ── Order Items ──
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "product_id" BIGINT NOT NULL REFERENCES "products"("id"),
        "amount" INT NOT NULL DEFAULT 1,
        "price" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        "discount" NUMERIC(12, 2) NOT NULL DEFAULT 0.00
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_order_items_order_id" ON "order_items"("order_id")`,
    );

    // ── Payment enums ──
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM (
        'pending',
        'ready',
        'received',
        'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_type_enum" AS ENUM (
        'in',
        'out'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM (
        'cash',
        'cash_on_delivery',
        'bank_transfer'
      )
    `);

    // ── Payments ──
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "user_id" INT NOT NULL,
        "transaction_number" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "amount" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "type" "payment_type_enum" NOT NULL DEFAULT 'in',
        "method" "payment_method_enum" NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_payments_order_id" ON "payments"("order_id")`,
    );

    // ── Shipping status enum ──
    await queryRunner.query(`
      CREATE TYPE "shipping_status_enum" AS ENUM (
        'pending',
        'delivering',
        'arrived',
        'received',
        'refused'
      )
    `);

    // ── Shipping ──
    await queryRunner.query(`
      CREATE TABLE "shipping" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "user_id" INT NOT NULL,
        "tracking_number" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "received_at" TIMESTAMPTZ,
        "declared_value" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        "shipping_cost" NUMERIC(12, 2) DEFAULT 0.00,
        "weight" NUMERIC(10, 3),
        "seats_count" INT DEFAULT 1,
        "description" TEXT,
        "status" "shipping_status_enum" NOT NULL DEFAULT 'pending'
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_shipping_order_id" ON "shipping"("order_id")`,
    );

    // ── Stocks ──
    await queryRunner.query(`
      CREATE TABLE "stocks" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "product_id" BIGINT NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
        "stock" INT NOT NULL DEFAULT 0 CHECK ("stock" >= 0),
        "reserved" INT NOT NULL DEFAULT 0 CHECK ("reserved" >= 0),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stocks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "shipping_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum"`);
  }
}
