# Linivera

**Connect work across AI tools in one local project.**

[한국어](README.ko.md) · [Documentation](docs/README.md) · [Examples](docs/examples.md#english) · [Download](https://github.com/fbwndrud/linivera/releases)

Linivera is a local workspace for the sources, generated results and review records of projects you create with AI. Keep text, images, audio, video and 3D files together, with a record of what went into each result.

Carry a story's setting into its illustrations, use selected images and audio in a video, then reuse those results in later work. When a source or setting changes, find the connected results that need another look. Your files and records stay on your computer, ready to continue in another conversation.

## What you can do

| Task | How Linivera helps |
|---|---|
| Keep sources and results together | Store and search documents, images, audio, video and 3D files, including their revisions. |
| Connect work across tools | Link generation requests, input material and result files for reuse in later production. |
| Develop a story | Build an outline and scenes; track characters, settings, story threads and evidence. |
| Review and choose results | Review generated candidates and record what you chose and why. |
| Find what needs updating | Follow the impact of a changed source or setting through later work. |
| Assemble short videos | Connect images and audio through shots and timelines into video, using local FFmpeg. |
| Inspect and share your work | Read manuscripts, sources and review records in Studio; export manuscripts as Web or EPUB. |

Your connected AI application writes and runs generation tools. Linivera keeps the material and results connected. You decide which candidates to accept. Reviews performed by the same AI remain labeled as self-review.

![Studio showing a manuscript and its review records](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-studio-preview.png)

*This example uses scripted inputs, AI responses and simulated approval. Studio supports English and Korean.*

## Installation

You need an AI application that supports MCP and **Node.js 24**. MCP lets your AI application call Linivera's tools.

Ask your assistant:

> Read https://github.com/fbwndrud/linivera and connect Linivera through MCP. Check the installation and connection, then help me start a project in a folder I choose.

<details>
<summary>Connect it yourself</summary>

For Claude Code, run this in the project folder where you want to use Linivera:

```sh
claude mcp add --scope project linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz
```

For Codex:

```sh
codex mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz
```

Reconnect the MCP server after registration. See [Getting started](docs/getting-started.en.md) for Windows settings and connection help.

</details>

## Try it

Create a small story example and open Studio:

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz demo
```

Open the address printed in your terminal. The example uses scripted responses, so you can try the workflow without an AI account. It saves to a new temporary folder. Stop the server with Ctrl+C.

## Start your own project

Tell your connected assistant what you want to make. For example:

> I'd like to create a short story and illustrations for it. Help me choose the audience and tone first. Use Linivera to keep the sources and results together, show me the candidates, and let me choose.

Choose a project folder and agree on the purpose, then start with one small task. Gather material, work with your AI, choose a result and carry it into the next task. Back up the whole folder for important work.

## Learn more

- [Getting started](docs/getting-started.en.md): connection, your first work and sharing
- [Documentation map](docs/README.md): writing, source management and production workflows — 한국어
- [Studio](docs/studio.md) · [Complete examples](docs/examples.md#english)
- [Installation and updates](docs/production.md) · [Supported environments](docs/compatibility.md) · [Backup and recovery](docs/operations.md) — 한국어
- [Contribute](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/fbwndrud/linivera/issues)

[Apache-2.0](LICENSE) · [Third-party notices](NOTICE)
