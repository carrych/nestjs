import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1700000005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id"     BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
        "role"        VARCHAR(20),
        "action"      VARCHAR(100) NOT NULL,
        "entity_type" VARCHAR(60),
        "entity_id"   VARCHAR(255),
        "details"     JSONB,
        "ip"          VARCHAR(45),
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"("user_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity_type", "entity_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC)`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
