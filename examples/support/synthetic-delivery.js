/** Explicit Linivera records and synthetic native response shapes; no external call is made. */
export function syntheticDeliveryData() {
  const identity = { platform: 'synthetic-channel', account: 'synthetic-account', externalId: 'post-1' };
  const record = (recordType, details, role = 'deliverable') => ({ version: 1, recordType, recordId: 'synthetic-' + recordType,
    issuer: 'synthetic-partner', observedAt: '2026-10-23T00:00:00Z', subjects: [{ role, hint: 'synthetic video' }],
    evidence: [{ role: 'source-document', hint: `synthetic ${recordType} evidence` }], details });
  return {
    brief: record('brief', { requirements: [{ id: 'opening', text: 'Keep the synthetic title visible', priority: 'required', evidence: [0] }] }),
    rights: record('rights', { claims: [{ id: 'license', status: 'reported-granted', permissions: ['distribution'], territories: ['KR'], channels: ['synthetic-channel'],
      validFrom: '2026-10-01T00:00:00Z', validUntil: null, conditions: 'Synthetic attribution required', attribution: 'Synthetic credit', evidence: [0] }] }),
    release: record('release', { identity, status: 'reported-published', publishedAt: '2026-10-20T00:00:00Z', url: 'https://example.invalid/synthetic-post' }),
    performance: record('performance', { identity, period: { start: '2026-10-20T00:00:00Z', end: '2026-10-22T00:00:00Z', asOf: '2026-10-22T12:00:00Z', basis: 'interval' },
      metrics: [{ id: 'views', metric: 'video-views', value: 120, unit: 'count', definition: 'Synthetic qualified view', dimensions: [{ name: 'territory', value: 'KR' }], evidence: [0] }] }, 'release'),
    runware: { data: [{ taskType: 'imageInference', taskUUID: 'task-a', imageUUID: 'image-a', imageURL: 'https://example.invalid/synthetic.png' }] },
    minimax: { task_id: 'task-b', status: 'Success', file_id: '90071992547409931234', base_resp: { status_code: 0, status_msg: 'ok' } },
    kling: { code: 0, data: { task_id: 'task-c', task_status: 'succeed', task_result: { videos: [{ id: 'video-c', url: 'https://example.invalid/synthetic.mp4', duration: '5' }] } } },
    generic: { task: { id: 'task-d', state: 'reported-ready' }, results: [{ url: 'https://example.invalid/synthetic.png' }] },
    contract: { version: 1, provider: 'synthetic-partner', endpoint: '/synthetic/v1', schemaVersion: 'fixture-v1', taskIdPointer: '/task/id', statusPointer: '/task/state',
      outputs: [{ pointer: '/results/0/url', role: 'image', required: true }] },
  };
}
