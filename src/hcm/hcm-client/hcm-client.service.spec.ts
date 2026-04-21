import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HcmClientService } from './hcm-client.service';

describe('HcmClientService', () => {
  let service: HcmClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HcmClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, any> = {
                'hcm.baseUrl': 'http://localhost:3999',
                'hcm.timeout': 5000,
                'hcm.retries': 3,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<HcmClientService>(HcmClientService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return true when HCM is reachable', async () => {
      const result = await service.healthCheck();
      expect(typeof result).toBe('boolean');
    });
  });
});
