import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoices1700000009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ──
    await queryRunner.query(`
      CREATE TYPE "invoice_status_enum" AS ENUM (
        'saved', 'done', 'canceled', 'reserved'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "invoice_type_enum" AS ENUM (
        'production', 'earnings', 'sales', 'write_off',
        'inventory', 'internal', 'commission', 'buyer_return', 'seller_return'
      )
    `);

    // NOTE: payment_method_enum already exists (init migration).
    // Values: 'cash', 'cash_on_delivery', 'bank_transfer'

    // ── Invoices ──
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id"                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "invoice_number"        SERIAL UNIQUE NOT NULL,

        -- Relations
        "order_id"              BIGINT REFERENCES "orders"("id") ON DELETE SET NULL,
        "user_id"               INT NOT NULL REFERENCES "users"("id"),
        "address_id"            INT,

        -- Seller & Contragent requisites
        "seller_tax_id"         TEXT,
        "seller_billing_id"     TEXT,
        "contragent_tax_id"     TEXT,
        "contragent_billing_id" TEXT,

        -- Invoice parameters
        "status"                "invoice_status_enum" NOT NULL DEFAULT 'saved',
        "type"                  "invoice_type_enum" NOT NULL,
        "payment_method"        "payment_method_enum",

        -- Finances
        "discount"              NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        "is_paid"               BOOLEAN NOT NULL DEFAULT FALSE,
        "deferred_payment"      TIMESTAMPTZ,

        -- Warehouses (no FK — storages table does not exist yet)
        "storage_from_id"       INT,
        "storage_to_id"         INT,

        -- Dates & notes
        "date"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "accounting_date"       TIMESTAMPTZ,
        "note"                  TEXT,
        "reason"                TEXT,

        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_invoices_order_id" ON "invoices"("order_id")`);
    await queryRunner.query(`CREATE INDEX "idx_invoices_user_id" ON "invoices"("user_id")`);

    // ── Invoice Items ──
    await queryRunner.query(`
      CREATE TABLE "invoice_items" (
        "id"                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "invoice_id"           BIGINT NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
        "product_id"           BIGINT NOT NULL REFERENCES "products"("id"),
        "product_variable_id"  INT,
        "quantity"             INT NOT NULL DEFAULT 1,
        "price"                NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        "discount"             NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        "accessory_id"         INT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_invoice_items_invoice_id" ON "invoice_items"("invoice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_status_enum"`);
  }
}
