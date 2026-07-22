import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import * as fs from 'fs';

export const databaseConfig = {
  useFactory: (): TypeOrmModuleOptions => {
    const dbType = (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'mysql';

    if (dbType === 'mysql') {
      // ===== MySQL 模式（生产 / 腾讯云部署） =====
      return {
        type: 'mysql',
        host: process.env.DB_MYSQL_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
        username: process.env.DB_MYSQL_USERNAME || 'root',
        password: process.env.DB_MYSQL_PASSWORD || '',
        database: process.env.DB_MYSQL_DATABASE || 'dxy_property',
        autoLoadEntities: true,
        synchronize: true, // 生产环境建议关闭，改用 migration
        timezone: '+08:00',
        charset: 'utf8mb4',
        logging: false,
      };
    }

    // ===== SQLite 模式（开箱即用，Cloud Studio 默认） =====
    const dbDir = join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    return {
      type: 'sqlite',
      database: process.env.DB_SQLITE_PATH || join(dbDir, 'dxy-property.db'),
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    };
  },
};
