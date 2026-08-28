import { Controller, Get } from '@nestjs/common';
import { AppService } from '../app.service';

@Controller()
export class RuntimeHealthController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getLiveness();
  }

  @Get('health/live')
  getLiveness() {
    return this.appService.getLiveness();
  }

  @Get('health/ready')
  getReadiness() {
    return this.appService.getReadiness();
  }

  @Get('version')
  getVersion() {
    return this.appService.getVersion();
  }
}
