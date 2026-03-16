import 'dotenv/config';
import { DataSource } from 'typeorm';

// In production (compiled dist/), entity and migration files live under dist/src/.
// In development, ts-node resolves directly from src/.
const isProduction = process.env.NODE_ENV === 'production';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: isProduction ? ['dist/src/**/*.entity.js'] : ['src/**/*.entity{.ts,.js}'],
  migrations: isProduction ? ['dist/src/migrations/*.js'] : ['src/migrations/*{.ts,.js}'],
  synchronize: false,
});

export default AppDataSource;
