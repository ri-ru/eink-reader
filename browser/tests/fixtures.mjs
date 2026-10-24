// Entirely original synthetic prose. No saved or redistributed Substack article.
export const paragraph = (number) => `Paragraph ${number}. A book page should have a steady edge and a complete last line. When the reader presses a button, the next words should arrive without a scrolling animation. Small screens and large screens need different line breaks, while every sentence must stay in order. We can make the type larger and still continue from nearly the same place. This paragraph is deliberately long enough to cross page boundaries when repeated, so a clipped line cannot hide behind a short demonstration.`;

export const articleBody = (label = 'first') => `
  <div class="body markup" dir="auto">
    <p data-qa-prose="lead">Opening of ${label}. This synthetic article exercises a readable, automatic, paginated view without exporting or downloading an ebook. <a href="#note-one">Jump to the footnote</a>.</p>
    ${Array.from({ length: 22 }, (_, i) => `<p data-qa-prose="${i}">${paragraph(i)}</p>`).join('\n')}
    <h2>Pictures and captions</h2>
    <figure>
      <img src="https://test.substack.com/picture.svg" width="1800" height="1400" alt="Black ink mountain" loading="lazy" onerror="window.cloneEventExecuted = true">
      <figcaption>A wide picture should fit on one page without hiding its caption.</figcaption>
    </figure>
    <p data-qa-prose="after-image">Words after the picture must remain reachable with the next-page button.</p>
    <h2>Code and a wide table</h2>
    <pre>const longUnbrokenExample = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';\nconsole.log(longUnbrokenExample);</pre>
    <table><thead><tr><th>Case</th><th>Expected behavior</th></tr></thead><tbody>
      <tr><td>Large text</td><td>Reflow without losing the reading position.</td></tr>
      <tr><td>Landscape orientation</td><td>Keep every line visible above the footer.</td></tr>
    </tbody></table>
    <p>A long URL: <a href="https://example.org/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz">https://example.org/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz</a>.</p>
    <p>A <a href="#note-one">footnote</a> and an <a href="https://test.substack.com/p/second">ordinary article link</a> should remain meaningful.</p>
    <p id="note-one">The footnote is part of the article, not a floating website advertisement.</p>
    <p><a href="javascript:window.cloneLinkExecuted=true">Unsafe script link</a></p>
    <iframe src="https://test.substack.com/embed" title="Embedded third-party widget"></iframe>
    <p data-qa-prose="ending">END OF ${label.toUpperCase()}. The final sentence must be readable and the next-page control must stop here.</p>
  </div>`;

export function fixture({ label = 'first', delayed = false, preview = false, unrelated = false, customHome = false } = {}) {
  const body = customHome ? '<main id="home"><h1>Publication home</h1><p>Choose an article.</p></main>' : unrelated ? '<main><h1>Not a Substack article</h1><p>An ordinary website should keep working.</p></main>' : `
    <main id="original-article">
      <h1 class="post-title">A quiet page: ${label}</h1>
      <h3 class="subtitle">An original fixture for e-ink reading</h3>
      <div class="byline">The test author</div>
      <div class="available-content">${delayed ? '' : articleBody(label)}</div>
      ${preview ? '<div class="paywall"><h2>This post is for paid subscribers</h2><a href="/subscribe">Subscribe to continue reading</a><a href="/sign-in">Sign in</a></div>' : ''}
    </main>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A quiet page</title>
    <style>body { font: 18px system-ui; margin: 0; } main { max-width: 680px; margin: 40px auto; } img { max-width: 100%; } iframe { height: 150px; } .paywall { border: 2px solid black; padding: 20px; }</style>
    ${customHome ? '<script type="text/plain" src="https://substackcdn.com/fixture.js"></script>' : ''}
    </head><body><nav id="site-navigation"><h1>The publication, not the article title</h1>Substack fixture navigation</nav>${body}
    <script>window.originalBridgeCalls=[];window.__einkbroPageScroll=(...args)=>{window.originalBridgeCalls.push(args);return false;};</script>
    ${delayed ? `<script>setTimeout(()=>{document.querySelector('.available-content').innerHTML=${JSON.stringify(articleBody(label))}},400)</script>` : ''}
    <!-- USER_SCRIPT -->
    </body></html>`;
}
