import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookSilenceDetectorService } from './webhook-silence-detector.service';
import { ConflictService } from '../../conflict/conflict.service';
import { ConflictType } from '../../conflict/entities/conflict-ticket.entity';

describe('WebhookSilenceDetectorService', () => {
  let service: WebhookSilenceDetectorService;
  let conflictService: jest.Mocked<ConflictService>;

  beforeEach(async () => {
    const mockConflictService = {
      createTicket: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'webhook.silenceThresholdMinutes': 30,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSilenceDetectorService,
        { provide: ConflictService, useValue: mockConflictService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WebhookSilenceDetectorService>(WebhookSilenceDetectorService);
    conflictService = module.get(ConflictService);
  });

  describe('updateWebhookReceived', () => {
    it('should track webhook timestamp per employee', async () => {
      await service.updateWebhookReceived('emp-1');
      await service.updateWebhookReceived('emp-2');

      // Access private map via any
      const serviceAny = service as any;
      expect(serviceAny.lastWebhookTime.get('emp-1')).toBeInstanceOf(Date);
      expect(serviceAny.lastWebhookTime.get('emp-2')).toBeInstanceOf(Date);
    });
  });

  describe('checkWebhookHealth', () => {
    it('should not create ticket when webhooks received within threshold', async () => {
      // All employees have recent webhooks
      await service.updateWebhookReceived('emp-1');
      await service.updateWebhookReceived('emp-2');

      await service.checkWebhookHealth();

      expect(conflictService.createTicket).not.toHaveBeenCalled();
    });
  });
});
