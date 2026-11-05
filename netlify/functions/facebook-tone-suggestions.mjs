import { getStore } from '@netlify/blobs';
import { createToneSuggestionsHandler } from '../../scripts/lib/facebook-tone-suggestions.mjs';

export default createToneSuggestionsHandler({ getStore });

export const config = {
  path: '/api/facebook-tone-suggestions',
  method: 'POST',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
