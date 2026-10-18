import { canonicalJson, sha256 } from '../util/hash.js';
import { anchorIsCurrent } from './anchors.js';
import { qualifyingSupport } from './qualification.js';

export function loreCurrent(work, publication, receipts = []) {
  if (!publication) return null;
  const snapshot = publication.snapshot;
  const valid = new Map(snapshot.evidence.map((e) => [e.id, anchorIsCurrent(e.anchor, work, receipts) && (!e.perspectiveId || work.entities.has(e.perspectiveId))]));
  const supported = qualifyingSupport(snapshot, valid);
  const staleEvidence = snapshot.evidence.filter((e) => !valid.get(e.id)).map((e) => e.id);
  const adopted = snapshot.claims.filter((c) => c.status === 'adopted');
  const effective = adopted.filter((c) => supported(c) && work.entities.has(c.entityId) && (!c.perspectiveId || work.entities.has(c.perspectiveId)));
  const staleAdopted = adopted.filter((c) => !effective.includes(c)).map((c) => c.id);
  const questions = snapshot.questions.map((q) => ({ ...q,
    effectiveStatus: q.status === 'resolved' && q.resolution.basis === 'verified' && !supported(q) ? 'stale' : q.status,
  }));
  const entityRevs = [...new Set(snapshot.claims.flatMap((c) => [c.entityId, c.perspectiveId]).filter(Boolean))].sort().map((id) => [id, work.entities.get(id)?.rev ?? null]);
  const contextRev = sha256(canonicalJson({ revision: publication.revision, staleEvidence, staleAdopted, questions, entityRevs }));
  return { revision: publication.revision, version: publication.version, contextRev, canon: effective.filter((c) => c.perspectiveId === null),
    perspectives: effective.filter((c) => c.perspectiveId !== null),
    evidence: snapshot.evidence.map((e) => ({ ...e, current: valid.get(e.id) === true })),
    claims: snapshot.claims.map((c) => ({ ...c, effectiveStatus: c.status === 'adopted' && !effective.includes(c) ? 'stale' : c.status })),
    questions, staleEvidence, staleAdopted };
}
