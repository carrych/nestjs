import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenVersionAndBlacklist1700000006000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Add token_version to users (default 1 — existing sessions stay valid)
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1
    `);

    // Persistent JTI blacklist for individual token revocation (logout)
    await queryRunner.query(`
      CREATE TABLE token_blacklist (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        jti         UUID         NOT NULL,
        user_id     BIGINT       REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TIMESTAMPTZ  NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_token_blacklist_jti      ON token_blacklist(jti)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_token_blacklist_expires_at      ON token_blacklist(expires_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_token_blacklist_user_id         ON token_blacklist(user_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE token_blacklist`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN token_version`);
  }
}
