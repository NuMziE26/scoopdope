export interface AppConfig {
  port: number;
  nodeEnv: string;
  allowedOrigins: string[];
}

const parseOrigins = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  },
});
