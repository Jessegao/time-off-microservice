export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    path: process.env.DATABASE_PATH || './data/time-off-service.sqlite',
  },
  hcm: {
    baseUrl: process.env.HCM_BASE_URL || 'http://localhost:3999',
    timeout: parseInt(process.env.HCM_TIMEOUT || '5000', 10),
    retries: parseInt(process.env.HCM_RETRIES || '3', 10),
    circuitBreaker: {
      failureThreshold: parseInt(process.env.HCM_CB_FAILURE_THRESHOLD || '5', 10),
      resetTimeout: parseInt(process.env.HCM_CB_RESET_TIMEOUT || '60000', 10),
    },
  },
  sync: {
    driftThreshold: parseFloat(process.env.DRIFT_THRESHOLD || '0.5'),
    criticalDriftThreshold: parseFloat(process.env.CRITICAL_DRIFT_THRESHOLD || '2'),
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100', 10),
  },
});
