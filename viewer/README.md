# Linivera viewer

The viewer is a local workspace for reading your manuscript and understanding
its review records. Choose Korean or English interface labels in the header;
manuscript text keeps its own language. The source version is 0.1.3.

- **Manuscript:** overview, manuscript, contents and story threads.
- **Review:** evidence desk, changes, review records and check groups.
- **Publish:** reading-edition preview and Web ZIP/EPUB downloads.
- **Library:** selected resources, sources, evidence, figures, references and connections.
- **Settings:** permitted writing-step settings and examples.

Search Contents by title or section ID. Filter finalized sections, unfinished
sections or those needing attention. Matching sections retain their parent
groups so their location stays clear.

In the reader, choose text and images, text only or images only. Reading settings
control text size, spacing, width, typeface and appearance. These preferences are
stored in your browser; they do not modify the work. Focus mode hides navigation
and the review panel. Use Exit focus mode or Escape to return.

Section review opens the current section’s review alongside the manuscript on wide
screens, or below it on small screens. Show in text highlights a finding’s quoted
passage and moves keyboard focus to it. Repeated quotes use the first match.
Evidence that cannot be located in the current reading view does not offer this
action. Highlighting never edits the text.

Review labels distinguish imported or unreviewed text, edits after review,
changed references and unverifiable records. Self-review and findings accepted
with a reason remain disclosed. A finalized record describes the recorded
version; it does not approve later edits. Use Refresh view after changes made by
your AI assistant or another editor. Updates are explicit, not automatic.

Open full review record for finalization steps, later reviews, accepted findings,
referenced versions and content fingerprints. Approvals and finalization remain
available through your AI assistant rather than through new viewer write actions.

When a work declares translations, revisions or summaries, **Reading edition**
selects the text, section receipts, publication preview and Web/EPUB download
together. Outline, settings, tracking and work-wide summaries describe the original.
UI language and manuscript/export language are independent. Missing edition text
is never filled with the original automatically.

**Resources** shows selected sources and approved results with their exact revisions,
evidence, self-review and later review needs. Ask the host to refresh metadata if
the list is not indexed or is stale. A resource-only workspace uses Library and
Examples. File capture, readiness comparisons and approvals use the MCP host;
reading the viewer creates no approval. Production binary files are not embedded
in a static review copy. See the [documentation map](../docs/README.md).

Export review view creates a read-only workspace copy with the included reading
editions and review records. From the Linivera repository, run
`npm run preview -- "/path/to/work/exports/viewer"` and open the printed address.
The export includes reading preferences controls but does not
offer writing-step mutations, viewer shutdown or another export.

To view a live work without an AI session, use
`npm run viewer -- "/path/to/work"`. First-time installation and screen preparation
are available through `npm run setup`. These commands serve only on your computer;
they do not deploy or publish content online.

## Development

From `viewer/`, install dependencies, then run `npm run build` and `npm test`.
The server serves `viewer/dist`; rebuild and reload after source changes.
Run the root repository’s `npm run check` for backend validation.

```bash
npm --prefix viewer ci
npm --prefix viewer run build
npm --prefix viewer test
```

Build output is not committed. React and Vite are development dependencies of
this folder; they do not become backend runtime dependencies. Screens call only
`/api/*`. The viewer reads its URL token, keeps it for the browser session and
sends it in the `X-Folio-Token` header.

For development, use
`FOLIO_VIEW_URL=http://127.0.0.1:<port> npm --prefix viewer run dev`
to connect to a running viewer server, with its token supplied as `?token=`.
The API proxy sets Origin to the target server for permitted local writes.
Writing-step changes still use the existing server validation. Required steps
have no toggle, and the server independently refuses disabling them.
