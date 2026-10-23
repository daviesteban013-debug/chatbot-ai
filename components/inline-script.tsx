/**
 * A script that runs while the browser parses the server HTML, before the first paint (see the
 * Next.js guide "How to prevent flash before hydration"). On the client it renders as text/plain,
 * so React neither warns about it nor runs it again.
 */
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
