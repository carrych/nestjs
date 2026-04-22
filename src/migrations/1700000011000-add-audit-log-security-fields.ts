import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogSecurityFields1700000011000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // outcome: SUCCESS or FAILURE — default SUCCESS for backward compat
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD COLUMN IF NOT EXISTS "outcome"         VARCHAR(20)  NOT NULL DEFAULT 'SUCCESS',
        ADD COLUMN IF NOT EXISTS "event_type"      VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "correlation_id"  VARCHAR(36),
        ADD COLUMN IF NOT EXISTS "user_agent"      VARCHAR(500)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_event_type" ON "audit_logs" ("event_type")
      WHERE "event_type" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_event_type"`);

    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        DROP COLUMN IF EXISTS "outcome",
        DROP COLUMN IF EXISTS "event_type",
        DROP COLUMN IF EXISTS "correlation_id",
        DROP COLUMN IF EXISTS "user_agent"
    `);
  }
}
