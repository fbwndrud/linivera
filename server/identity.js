import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** The installed manifest is the authority for the MCP identity, including after a rename. */
export const SERVER_INFO = Object.freeze({ name: manifest.name, version: manifest.version });

export const SERVER_INSTRUCTIONS = `${manifest.name} manages local resources, revisions, evidence and review records. `
  + 'The host writes text, generates images and runs model inference. Use user-confirmed absolute work folders. '
  + 'Ask about purpose, audience, language and the details to track before creating the work. '
  + 'Relay actual user decisions; do not turn self-review or an example approval into author acceptance. '
  + 'After initialization, use folio_interview to preserve actual answers and confirmation; read saved answers before asking again. '
  + 'Use folio_lore for explicit author-approved lore and unresolved questions; tracking observations are not automatic adoption. '
  + 'Use folio_init with the agreed manuscript language and folio_structure to prepare the agreed outline. Drive folio_run until idle; '
  + 'answer needs_model requests with folio_resume using the requested schema. At needs_user, '
  + 'show the draft and findings and wait for the actual user decision before folio_decide. '
  + 'Never bypass hard findings or rewrite text from soft advice without consent. Use folio_status '
  + 'when resuming; changed sources or assets may require another check. Use folio_view for Studio '
  + 'and folio_export for the requested reading edition. Read linivera://guides/getting-started '
  + 'and the listed workflow resources for detailed instructions; no separate skill copy is required '
  + 'when the host supports MCP resources. Hosts without resources can load skill/folio/. '
  + 'Studio supports Korean and English UI independently of Reading edition. Reading edition selects '
  + 'the original or a declared translation/revision/summary for section text, section review records and publication; '
  + 'settings and tracking remain tied to the original. Tool IDs retain the folio_* prefix for compatibility.';
