import { useI18n } from '../i18n/context.jsx';

export function Examples() {
  const { t, locale } = useI18n();
  const examples = [
    ['Story', 'Follow one scene from a plan to a review record.', 'story'],
    ['Guide', 'Organize sections and track the terms used in them.', 'guide'],
    ['Picture book', 'Keep spread text and illustration briefs together.', 'picturebook'],
    ['Fairy tale', 'Follow character choices and their consequences.', 'fairytale'],
  ];
  return <section className="examples-page">
    <h1>{t("Examples")}</h1>
    <p className="overview-intro">{t("Start with a small example, then explore a complete work separately.")}</p>
    <section className="next-action"><h2>{t("Small examples included with Linivera")}</h2>
      <p>{t("These use synthetic inputs, scripted AI responses and simulated approval. They show the workflow, not independent writing quality.")}</p>
      <div className="example-grid">{examples.map(([name, description, id]) => <article key={id} className="example-card"><h3>{t(name)}</h3><p>{t(description)}</p><blockquote>{t("Ask your AI assistant: Run Linivera’s {example} synthetic example in a new folder and open its viewer.", { example: id })}</blockquote></article>)}</div>
      <details><summary>{t("Command-line instructions")}</summary><pre><code>{`npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz examples all --language ${locale} --out ./my-new-examples`}</code></pre><p>{t("Use a new output folder. Linivera will not overwrite an existing example folder.")}</p></details>
    </section>
    <section><h2>{t("Complete works with images")}</h2>
      <p>{t("Complete works are separate ZIP bundles. Each contains the manuscript, images, sources, a Linivera work copy, a read-only Studio, Web and EPUB editions.")}</p>
      <ol><li>{t("Extract a bundle and read README.md.")}</li><li>{t("Open web/index.html in a browser or epub/book.epub in an ebook app.")}</li><li>{t("Run node serve.mjs in the extracted folder to open the read-only Studio.")}</li><li>{t("Copy the whole folder before editing. Ask your AI assistant to inspect the work folder and its pending questions first.")}</li></ol>
      <p className="muted">{t("Download addresses appear in the collection supplied with a release. Linivera does not download or publish works automatically.")}</p>
    </section>
  </section>;
}
