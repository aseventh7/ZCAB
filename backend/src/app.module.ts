import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OwnersModule } from './modules/owners/owners.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ParkingModule } from './modules/parking/parking.module';
import { BillsModule } from './modules/bills/bills.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PrintModule } from './modules/print/print.module';
import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(databaseConfig),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'dxy-property-default-secret',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    OwnersModule,
    BuildingsModule,
    RoomsModule,
    ParkingModule,
    BillsModule,
    FinanceModule,
    PrintModule,
  ],
  providers: [
    // 全局守卫：默认所有接口需登录，@Public() 标记的接口公开
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
