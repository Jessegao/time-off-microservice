import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BalanceChangedHandler, HcmBalanceChangedEvent } from './handlers/balance-changed.handler';

@ApiTags('hcm-webhooks')
@Controller('api/v1/hcm/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly balanceChangedHandler: BalanceChangedHandler) {}

  @Post('balance-changed')
  @ApiOperation({ summary: 'Handle HCM balance changed event' })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 202, description: 'Event accepted for processing' })
  async handleBalanceChanged(@Body() event: HcmBalanceChangedEvent): Promise<{ status: string }> {
    this.logger.log(`Received balance changed webhook: ${event.eventId}`);
    await this.balanceChangedHandler.handle(event);
    return { status: 'processed' };
  }
}
