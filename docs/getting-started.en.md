# Getting started with Linivera

The prepared engine package is **0.1.3** and includes the MCP server and built Studio.
The download commands below use that release. Existing installations need the new package
URL and a server reconnect. For development, see the [source setup](../README.md#installation).
See the [documentation map](README.md) and [changelog](../CHANGELOG.md).

## Connect your AI application

Ask your assistant:

> Install Linivera from https://github.com/fbwndrud/linivera using its prepared release package, register the MCP server for this AI application, and check the connection. Follow the README installation instructions.

You need Node.js 24 (22.13+ within 22.x, or 26.x also supported). The prepared package includes Studio. No cloning, source build or separate model download is needed. npm downloads the package and its dependencies on first use; you need internet access then. The package is distributed through GitHub Releases, not the npm registry.

For a manual registration command, see [Installation](../README.md#installation). Reconnect or restart the AI application after registering. Ask it to list the server tools: the 0.1.3 server reports `linivera`, version `0.1.3`, with 23 tools. Always compare against the installed package manifest; older archives keep their own version and tool set. Existing tool IDs still start with `folio_` for compatibility.

The server supplies basic workflow instructions on connection. Hosts supporting MCP resources can read this guide at `linivera://guides/getting-started`, the detailed skill at `linivera://guides/skill`, and its listed references. The detailed references currently use Korean; this guide and the tool descriptions cover the first English workflow. For a host without resource support, its instruction/skill mechanism can load the packaged `skill/folio/` folder.

## Try an example before writing

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz demo
```

This creates a new English synthetic story with fixed responses and simulated approval, then prints the Studio address. Open that address. You can select English or Korean in the toolbar; UI language and manuscript language are separate choices. No AI account is used for the demonstration.

The terminal prints the saved work folder. The default is a new temporary folder; use `demo --out ./my-first-example` to keep it in a chosen new folder. The folder's parent must already exist. An existing folder is never overwritten. Stop Studio with Ctrl+C. To reopen a saved work:

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz view ./my-first-example/story
```

Use `demo --language ko` for Korean. For four small English examples with automatic verification and cleanup, run the same package with `examples all --verify`.

## Ask for your own work

Tell the connected assistant:

> Help me write a short story with Linivera in English. First confirm a new folder for the work, then ask about my readers, main character and tone. Keep the agreed setting with the manuscript and show me the draft in Studio. I'll decide whether to accept it.

Give the assistant a folder you control. Do not use the package installation folder for your work. Agree on the audience, language, outline and details worth tracking. Start with one scene. You can add tracking rules as the project grows.

Ask it to save your manuscript language when creating the work, for example `language: "en"` with `folio_init`. Studio's UI language is a separate choice. Web and EPUB use the saved manuscript language unless you request an override. Older works without this setting retain the Korean export default; you can add `language: en` to their `work.yaml` when you choose to.

The assistant prepares the work with `folio_init` and `folio_structure`, then uses `folio_run`. It handles `needs_model` requests with `folio_resume`, providing the requested text or structured answer. At `needs_user`, it shows you the draft and findings and waits for your decision. Only your actual approval can be relayed through `folio_decide`; simulated approvals in example fixtures do not apply to your work. A blocking finding must be resolved first. An advisory should be discussed rather than silently changing the manuscript.

## Read and review

Ask the assistant to open Studio with `folio_view`. Read the draft, inspect the Review screen and follow evidence links. A check by the same AI host is labeled self-review. It can still miss a mistake.

If a setting, source or image changes, use `folio_status` to identify work requiring another check. An old acceptance applies to the old version. Ask the assistant to review affected sections and show them again before sharing.

Your AI application generates images using the tools it supports. Linivera stores the image ID, immutable file version, review and usage locations. It does not supply an image generation model or API subscription.

## Connect production files in 0.1.3

For images, audio, videos, workflow and project files, start with the
[production-data guide (Korean)](production-data.md). Retain exact file revisions, compare
required inputs and connection readiness, seal a context bundle, then review captured
outputs before selecting them for later work. Download links and successful external
tool calls do not establish local retention or user approval.

The catalog provides four representative capability specifications and six access
specifications. The 37-partner research table covers a wider investigation; it does not
mean 37 executable integrations. Provider transport and credentials belong to the host.
The combined synthetic example `node examples/chroma-continuity.js` checks two later
tasks and historical Inputs; it makes no real provider calls. See [examples](../examples/README.md).

## Share and return later

Ask to export the selected reading edition as Web or EPUB with `folio_export`. Inspect the actual output. A read-only Studio export lets someone inspect the work's records; a reading copy is not an editable-project backup. See [complete English examples](examples.md#english).

Back up the entire work folder, including hidden records. When returning, give the assistant the same folder and ask it to read the status before continuing. Keep your installation and work folders separate.

## If the server does not connect

First check `node --version` and `npx --version` in the environment used by the AI application. A first package download may take longer than the host's startup timeout; run the demo once to populate npm's cache, then reconnect. In Codex, increase `startup_timeout_sec` to 60 if needed. On Windows, use `cmd /c npx` in the MCP command; the README includes an example.

For an offline machine, download the prepared archive and install it with its dependencies while online. Register its local `bin/linivera-mcp.js` afterward. See the [detailed installation guide (Korean)](production.md). Source builds and optional local embeddings are separate from the default installation.
