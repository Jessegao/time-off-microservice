import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface HcmBalance {
  employeeId: string;
  typeId: string;
  availableDays: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}

export interface HcmRequestPostResponse {
  hcmRequestId: string;
  status: 'CONFIRMED' | 'REJECTED';
  errorCode?: string;
  errorMessage?: string;
  hcmBalance?: number;
}

@Injectable()
export class HcmClientService {
  private readonly logger = new Logger(HcmClientService.name);
  private readonly client: AxiosInstance;
  private readonly timeout: number;
  private readonly retries: number;

  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailureTime: Date | null = null;

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>('hcm.baseUrl') || 'http://localhost:3999';
    this.timeout = this.configService.get<number>('hcm.timeout') || 5000;
    this.retries = this.configService.get<number>('hcm.retries') || 3;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as any;
        if (!config) return Promise.reject(error);

        config.metadata = config.metadata || { attemptNumber: 0 };
        config.metadata.attemptNumber = (config.metadata.attemptNumber || 0) + 1;

        if (this.isRetryableError(error) && config.metadata.attemptNumber < this.retries) {
          const delay = this.calculateExponentialBackoff(config.metadata.attemptNumber);
          this.logger.warn(`Retrying HCM request, attempt ${config.metadata.attemptNumber}, delay ${delay}ms`);
          await this.sleep(delay);
          return this.client(config);
        }

        return Promise.reject(error);
      },
    );
  }

  async getBalance(employeeId: string, typeId: string): Promise<HcmBalance> {
    this.logger.debug(`Getting balance from HCM: employee=${employeeId}, type=${typeId}`);

    const response = await this.client.get<HcmBalance>('/balances', {
      params: { employeeId, typeId },
    });

    return response.data;
  }

  async getAllBalances(): Promise<HcmBalance[]> {
    this.logger.debug('Getting all balances from HCM');

    const response = await this.client.get<HcmBalance[]>('/balances/all');
    return response.data;
  }

  async postTimeOffRequest(request: {
    employeeId: string;
    typeId: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    localRequestId: string;
  }): Promise<HcmRequestPostResponse> {
    this.logger.log(`Posting time off request to HCM: ${request.localRequestId}`);

    try {
      const response = await this.client.post<HcmRequestPostResponse>(
        '/time-off-requests',
        request,
        {
          headers: {
            'X-Idempotency-Key': request.localRequestId,
          },
        },
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data as any;

        if (status === 400) {
          return {
            hcmRequestId: '',
            status: 'REJECTED',
            errorCode: data?.code || 'INSUFFICIENT_BALANCE',
            errorMessage: data?.message || 'Balance insufficient',
            hcmBalance: data?.hcmBalance,
          };
        }

        if (status === 404) {
          return {
            hcmRequestId: '',
            status: 'REJECTED',
            errorCode: 'NOT_FOUND',
            errorMessage: 'Employee or type not found in HCM',
          };
        }
      }

      throw error;
    }
  }

  async getRequestStatus(hcmRequestId: string): Promise<{ status: string; hcmId?: string }> {
    this.logger.debug(`Getting request status from HCM: ${hcmRequestId}`);

    const response = await this.client.get(`/time-off-requests/${hcmRequestId}/status`);
    return response.data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  private isRetryableError(error: AxiosError): boolean {
    if (!error.response) return true;
    const status = error.response.status;
    return status >= 500 || status === 429;
  }

  private calculateExponentialBackoff(attempt: number): number {
    const base = Math.pow(2, attempt - 1) * 1000;
    const jitter = base * 0.2 * Math.random();
    return base + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
