import { Module, Global } from '@nestjs/common';
import { HcmClientService } from './hcm-client.service';

@Global()
@Module({
  providers: [HcmClientService],
  exports: [HcmClientService],
})
export class HcmClientModule {}
