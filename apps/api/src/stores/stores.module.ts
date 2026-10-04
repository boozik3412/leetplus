import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoresController } from './stores.controller';
import { StoreClosuresService } from './store-closures.service';
import { StoresService } from './stores.service';

@Module({
  imports: [AuthModule],
  controllers: [StoresController],
  providers: [StoresService, StoreClosuresService],
})
export class StoresModule {}
