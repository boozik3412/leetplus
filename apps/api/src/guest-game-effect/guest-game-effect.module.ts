import { Module } from '@nestjs/common';
import { GuestGameEffectService } from './guest-game-effect.service';

/**
 * Read-mostly analytics of the game effect. Shared by the guest CRM (guest
 * card) and the game administration (effect tab), so it depends on Prisma
 * only and imports neither module.
 */
@Module({
  providers: [GuestGameEffectService],
  exports: [GuestGameEffectService],
})
export class GuestGameEffectModule {}
