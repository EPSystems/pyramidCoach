import type { Instrumentation } from 'next';
import { createLogger } from '@/lib/log';

const log = createLogger('server');

/** Every server error Next captures (render, route handler, server action, proxy), keyed by digest for matching error.tsx reports. */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  log.error('request error', {
    err,
    method: request.method,
    path: request.path.split('?')[0],
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
