import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeRecord } from '../../../adapters/production/native-records.js';

test('native records redact credential header and compound key spellings while preserving generation text and token counts', () => {
  const input = { headers: {
    'set-cookie': 'fixture-cookie-secret', cookie: 'fixture-session-cookie',
    'x-amz-security-token': 'fixture-sts-token', 'X-Api-Key': 'fixture-api-key',
  }, client_secret: 'fixture-client-secret', secret_access_key: 'fixture-access-secret',
  aws_access_key_id: 'fixture-access-id', refreshToken: 'fixture-refresh-token',
  parameters: { prompt: 'A character holds a brass token and a cookie', max_tokens: 40, token_count: 12, vocabulary: ['token', 'secret'] } };
  const captured = nativeRecord('submit', input);
  for (const [key, value] of Object.entries(captured.record.headers)) {
    assert.equal(value, '[redacted]', key); assert.ok(captured.omittedPaths.includes(`headers.${key}`));
  }
  for (const key of ['client_secret', 'secret_access_key', 'aws_access_key_id', 'refreshToken']) {
    assert.equal(captured.record[key], '[redacted]'); assert.ok(captured.omittedPaths.includes(key));
  }
  assert.deepEqual(captured.record.parameters, input.parameters);
});
