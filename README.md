# Linivera

**Keep your sources, versions, and results connected.**

[한국어](README.ko.md) · [English examples](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-examples-en.zip) · [Releases](https://github.com/fbwndrud/linivera/releases/tag/v0.1.2) · [Getting started](docs/getting-started.en.md) · [Report a bug](https://github.com/fbwndrud/linivera/issues)

Linivera is a local data workspace for projects you work on with an AI assistant. Keep source documents, structured data, images, revisions, evidence and review history together. Writing is one use case. Open Studio to read the work, follow its references and see what needs another check. Export a reading edition as a website or EPUB.

**The 0.1 series is an early release for local use.** You need an AI application that supports stdio MCP to write with Linivera. Your AI application writes and, if its tools support it, generates images; Linivera manages the files and records. Studio offers Korean and English.

![Studio showing a synthetic example](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-studio-preview.png)

*The screenshot uses a fixed synthetic example with simulated model responses and approval.*

## Installation

Give your AI assistant the repository address and ask:

> Install https://github.com/fbwndrud/linivera as an MCP server for this AI application. Use the prepared release package and follow its README. Check that the server connects before creating a work.

You need **Node.js 24**. Node 22.13+ within 22.x and Node 26.x are also supported. The prepared package includes Studio; you do not need to clone the repository, build it or edit an absolute script path. npm downloads the package and dependencies on first use. Linivera is distributed through GitHub Releases and is not yet on the npm registry.

<details>
<summary>Register it yourself: Claude Code, Codex or Grok CLI</summary>

Run the command for your AI application, then reconnect or restart it.

**Claude Code** — run in the project where you want to use Linivera:

```sh
claude mcp add --scope project linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

**Codex:**

```sh
codex mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

**Grok CLI:**

```sh
grok mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

On Windows, replace `-- npx` with `-- cmd /c npx`. For apps with a JSON MCP settings form:

```json
{
  "mcpServers": {
    "linivera": {
      "command": "npx",
      "args": ["-y", "https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz"]
    }
  }
}
```

Windows JSON settings use `"command": "cmd"` and start `args` with `"/c", "npx", "-y"`. If first startup times out, run the demo below once to cache the package and reconnect. Codex users can set `startup_timeout_sec = 60`. Registration commands follow the [Codex MCP documentation](https://developers.openai.com/codex/mcp) and the installed host CLIs' help.

</details>

## Try it

One command creates a small **English** story and opens a local Studio server:

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz demo
```

Open the address printed in the terminal. Choose English or Korean in the toolbar. The demo uses fixed responses and simulated approval, so no AI account or model download is needed. Stop Studio with Ctrl+C.

The printed work path is a new temporary folder. To keep the example in a folder you choose, add `--out ./my-first-example`; that folder must not exist yet. Use `demo --language ko` for the Korean example. [Getting started](docs/getting-started.en.md) explains reopening a work, checking the connection and writing your first scene.

<details>
<summary>Develop from source</summary>

```sh
git clone https://github.com/fbwndrud/linivera.git
cd linivera
npm run setup
node bin/linivera.js demo
```

`npm run setup` installs dependencies and builds Studio. Build a distributable package with `npm run package:build`. Source setup is for development; the prepared release package already includes the screens.

</details>

## Start your own work

After connecting, ask your assistant:

> Help me write a short story with Linivera in English. First confirm a new folder for the work, then ask about my readers, main character and tone. Keep the agreed setting with the manuscript and show me the draft in Studio. I'll decide whether to accept it.

The server sends basic workflow instructions on connection. Hosts supporting MCP resources can read the bundled guide and detailed references directly; a separate skill copy is not required for that route. See [Getting started](docs/getting-started.en.md) for the full workflow and hosts without resource support.

Linivera records what was checked and which version you accepted. If a relevant source, setting or image changes, it flags the work that needs another review. A blocking finding prevents acceptance; an advisory does not rewrite your text. A review by the same AI host is marked as self-review.

## What you can do

| Task | What Linivera provides |
|---|---|
| Write a structured work | An outline, step-by-step drafting, checks and author decisions; built-in packs for stories, guides and illustrated books |
| Keep track of details | Characters, relationships, promises and custom tracking rules, with references back to the work |
| Manage material | Original resources, immutable revisions, derived results and metadata, with keyword and optional local text/image vector retrieval |
| Manage illustrations | Image IDs, file hashes, versions, review status and usage locations; generation runs in your AI application |
| Inspect the work | Manuscript, Review and Publish views; changes, evidence, relationships and tracking timelines |
| Share a reading copy | Web ZIP, EPUB and a read-only Studio snapshot; PDF through browser printing |

Manuscripts are Markdown and settings are YAML. Activity and decisions are kept in an append-only ledger inside the work folder. Back up the whole folder to keep the work and its records together.

Optional [vector retrieval (한국어)](docs/embeddings.md) requires a separate Python runtime and pinned Google multimodal model weights. They are not included in the installation. A model's interpretation and a recorded check can still be wrong; an accepted version is your decision, not a guarantee of factual accuracy.

## Open a complete example

Choose an [English example library](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-examples-en.zip) or the [Korean example library](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-examples-ko.zip). Both are separate downloads from the [v0.1.1 release](https://github.com/fbwndrud/linivera/releases/tag/v0.1.1).

The English library contains four works—a short story, a picture-book manuscript with two illustrations, a practical beginner guide and a four-chapter story—plus an English translation of the Korean short story. The four-chapter story is a 2,657-word structural example, not a full-length novella. The Korean library includes a longer story and a research-book draft.

Each bundle contains a Linivera work copy, images where used, Web/EPUB editions and a read-only Studio. Extract a ZIP, read its English or Korean README and run `node serve.mjs` to open the collection. Copy the entire example folder before editing. See [example instructions](docs/examples.md#english).

The translation keeps its Korean original and source-bound English variant. Its Web, EPUB and updated Studio open the English translation. In Studio, use **Reading edition** to switch between the original and translation; section text, review records and publication follow that choice. Settings and tracking remain tied to the original.

The edition selector is included in the current source checkout and updated English Studio bundles. The original `folio-0.1.0.tgz` and earlier example ZIPs remain unchanged. The prepared `linivera-0.1.2.tgz` includes the built Studio and current MCP server.

English examples use simulated approval and same-host review. The Korean research book remains a draft awaiting author approval. These examples show the workflow and its outputs, not an independent assessment of writing quality. Generated works are release downloads; the source and engine package contain only small synthetic fixtures.

## Moving from Folio

Folio is now Linivera. Your work folders need no conversion: `.folio` records, accepted versions and resource IDs stay the same. The new package is `linivera`, and the commands are `linivera-mcp`, `linivera-view` and `linivera-doctor`. The `folio-*` commands remain available.

MCP tool IDs still use `folio_*`, and the skill keeps its `folio` ID and `skill/folio/` path so existing instructions continue to work. Optional embedding settings retain `FOLIO_EMBEDDING_*`. The GitHub repository has moved to [fbwndrud/linivera](https://github.com/fbwndrud/linivera); update an existing clone with `git remote set-url origin https://github.com/fbwndrud/linivera.git`. Earlier release files keep their original names and checksums.

## Update an existing installation

1. Stop Studio and disconnect the MCP server in your AI app. Back up the entire work folder; keep it separate from the installation.
2. For an npx registration, replace the package URL with the v0.1.2 URL in Installation and reconnect. For a source checkout, run `git pull --ff-only` and `npm run setup`. For a release archive, install the downloaded archive in a new installation folder with `npm install --omit=dev --ignore-scripts /path/to/downloaded-package.tgz`.
3. Replace any separately copied `skill/folio/` folder with the version from that installation. Update the MCP script path if the installation moved.
4. Reconnect the MCP server and start a fresh chat if the app caches its tools or instructions. Confirm that the server's reported name/version match the installed `package.json`, then read the work's status and reopen Studio.

Running processes and old read-only Studio snapshots do not update automatically. Re-export a snapshot to include the new screens. Keep the previous installation so you can switch the MCP path back if needed. These changes preserve the work format and `folio_*` tool IDs.

## Before relying on it

Linivera runs on your machine. It does not provide a hosted service, authentication, collaborative editing or an automatic publishing service. The MCP server accepts absolute work paths; your AI application must restrict access to folders you choose. Studio and the example preview server bind to loopback.

Keep backups before working on important material. The [operations guide (한국어)](docs/operations.md) covers diagnosis, restoration and interrupted writes. The [compatibility guide (한국어)](docs/compatibility.md) separates tested environments from unsupported assumptions. AI subscriptions and generation costs belong to the application you connect.

## Read more and contribute

- **Writing:** [First work](docs/writing-guide.md), [images](docs/assets.md), [sources and resources](docs/resources.md), [Studio](docs/studio.md), [exports](docs/export.md) — 한국어.
- **Setup and recovery:** [Connect](docs/connect.md), [install](docs/production.md), [operations](docs/operations.md) — 한국어.
- **Development:** [Contributing](CONTRIBUTING.md), [testing](docs/testing.md), [security](SECURITY.md) — 한국어. Run `npm run check` and the checks listed in the contribution guide. Use synthetic reproductions in issues; do not upload private works or credentials.

Linivera's code is [Apache-2.0](LICENSE). The separately released example manuscripts, original images and notes are CC0-1.0, with third-party quotes, code and trademarks excluded. Studio bundles include their third-party licenses and source references in `THIRD-PARTY-NOTICES.txt`; see [NOTICE](NOTICE).

Approved lore, evidence, unresolved questions and saved interview confirmations: [workflow guide](docs/lore-interview.md).
