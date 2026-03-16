import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedMessages1700000008000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // processed_messages — idempotency table for queue consumers
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processed_messages" (
        "id"               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "scope"            VARCHAR(100) NOT NULL,
        "message_id"       VARCHAR(200) NOT NULL,
        "idempotency_key"  VARCHAR(200) NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_processed_messages_message_id"
        ON "processed_messages" ("message_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_processed_messages_idempotency_key"
        ON "processed_messages" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);

    // outbox_status_enum + outbox_messages — transactional outbox pattern
    await queryRunner.query(
      `CREATE TYPE "outbox_status_enum" AS ENUM ('PENDING', 'SENT', 'FAILED')`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outbox_messages" (
        "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "type"            VARCHAR(100) NOT NULL,
        "payload"         JSONB NOT NULL,
        "status"          "outbox_status_enum" NOT NULL DEFAULT 'PENDING',
        "attempts"        INTEGER NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMPTZ NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_messages_status_next_attempt"
        ON "outbox_messages" ("status", "next_attempt_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outbox_messages_status_next_attempt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_messages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "outbox_status_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_processed_messages_idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_processed_messages_message_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_messages"`);
  }
}
