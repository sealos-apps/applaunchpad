import { jsonRes } from '@/services/backend/response';
import type { NextApiRequest, NextApiResponse } from 'next';

// Public compatibility endpoint for clients using the main configuration contract.
// Expose only client-facing cloud fields; keep the legacy getInitData endpoint.
function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const port = Number(value.replace(/^:/, ''));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid cloud port');
  }
  return port;
}

export function getClientAppConfigServer() {
  if (!global.AppConfig) throw new Error('AppConfig is not correctly loaded');
  const { cloud } = global.AppConfig;
  return {
    domain: cloud.domain,
    port: parsePort(cloud.port, 443),
    httpPort: parsePort(cloud.httpPort, 80),
    disableHttps: !!cloud.disableHttps,
    userDomains: cloud.userDomains || [],
    desktopDomain: cloud.desktopDomain
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return jsonRes(res, { code: 200, data: getClientAppConfigServer() });
  } catch {
    return jsonRes(res, { code: 500, message: 'Server misconfigured' });
  }
}
