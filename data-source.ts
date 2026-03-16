import 'dotenv/config';
import { DataSource } from 'typeorm';

// Detect if running as compiled JavaScript or directly via ts-node.
// NestJS CLI compiles to dist/ and runs with plain `node` (no ts-node hooks).
const isCompiled = __filename.endsWith('.js');

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: isCompiled ? ['dist/src/**/*.entity.js'] : ['src/**/*.entity.ts'],
  migrations: isCompiled ? ['dist/src/migrations/*.js'] : ['src/migrations/*.ts'],
  synchronize: false,
});

export default AppDataSource;
