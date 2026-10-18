import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';

export const FIELDS = Object.freeze(['purpose', 'audience', 'language', 'surfaceEase', 'conceptPacing', 'inferenceLoad', 'complexityRamp']);
export const AXES = Object.freeze(FIELDS.slice(3));
export const fail = (code, text) => { throw new FolioError(code, text); };
export function text(v, label, max = 4000) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\uD800-\uDFFF]/u.test(v)) fail('INTERVIEW_INPUT_INVALID', label);
  return v;
}
export function keys(v, allowed) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some((k) => !allowed.includes(k))) fail('INTERVIEW_INPUT_INVALID', 'unexpected fields');
}
export function fieldList(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || new Set(fields).size !== fields.length || fields.some((f) => !FIELDS.includes(f))) fail('INTERVIEW_INPUT_INVALID', 'choose unique known fields');
  return [...fields];
}
export function normalizeAnswers(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > FIELDS.length) fail('INTERVIEW_INPUT_INVALID', 'answers required');
  const out = input.map((a) => {
    keys(a, ['field', 'value', 'raw']);
    return { field: a.field, value: text(a.value, 'answer value', 1000), raw: text(a.raw, 'raw answer') };
  });
  fieldList(out.map((a) => a.field));
  return out;
}
export function applyAnswers(before, answers) {
  const profile = structuredClone(before);
  const language = answers.find((a) => a.field === 'language')?.value ?? before.language?.value;
  const languageChanged = language !== before.language?.value;
  for (const a of answers) {
    const prior = before[a.field];
    const confirmed = Boolean(prior?.confirmed && prior.value === a.value && (!AXES.includes(a.field) || !languageChanged));
    profile[a.field] = { value: a.value, raw: a.raw, confirmed, confirmation: confirmed ? prior.confirmation : null };
  }
  if (languageChanged) for (const axis of AXES) if (profile[axis]) profile[axis] = { ...profile[axis], confirmed: false, confirmation: null };
  return profile;
}
export function applyConfirmation(before, fields, confirmation) {
  const profile = structuredClone(before);
  for (const field of fields) if (!profile[field]) fail('INTERVIEW_ANSWER_MISSING', field);
  if (fields.some((f) => AXES.includes(f)) && (!profile.language || (!profile.language.confirmed && !fields.includes('language')))) fail('INTERVIEW_LANGUAGE_UNCONFIRMED', 'confirm the work language first');
  for (const field of fields) profile[field] = { ...profile[field], confirmed: true, confirmation: { text: confirmation, language: field === 'language' || AXES.includes(field) ? profile.language.value : null } };
  return profile;
}
export const revisionOf = (parentRev, profile) => sha256(canonicalJson({ parentRev, profile }));
export const interviewView = (revision, profile) => ({ revision, profile: structuredClone(profile), pending: FIELDS.filter((f) => !profile[f]?.confirmed) });
