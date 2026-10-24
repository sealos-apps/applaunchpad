import type { z } from 'zod';
import { isCustomPublicDomainPrefixEnabled } from './feature-gates';
import {
  validatePublicDomainPrefix,
  getPublicDomainPrefixValidationMessage
} from './public-domain';

export function validatePortRequest(
  data: {
    protocol?: string;
    accessMode?: string;
    publicDomain?: string;
    isPublic?: boolean;
    exposesPublicDomain?: boolean;
  },
  ctx: z.RefinementCtx
) {
  const applicationProtocol =
    !data.protocol || ['http', 'grpc', 'ws'].includes(data.protocol.toLowerCase());
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (!applicationProtocol && data.accessMode === 'domain')
    issue('accessMode', 'domain access mode requires an application protocol');
  if (data.publicDomain === undefined) return;
  if (!isCustomPublicDomainPrefixEnabled())
    issue('publicDomain', 'Custom public domain prefixes are disabled');
  if (
    !applicationProtocol ||
    data.accessMode === 'nodePort' ||
    data.isPublic === false ||
    data.exposesPublicDomain === false
  )
    issue('publicDomain', 'publicDomain requires public domain access');
  const validation = validatePublicDomainPrefix(data.publicDomain);
  if (!validation.valid) issue('publicDomain', getPublicDomainPrefixValidationMessage(validation));
}
