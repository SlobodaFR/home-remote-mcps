export interface MarkitdownConvertResult {
  markdown: string;
}

export type MarkitdownTestResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * markitdown-connector Python sidecar, which wraps Microsoft's `markitdown`
 * library to convert documents/URLs (PDF, Office docs, images, HTML,
 * CSV/JSON/XML, ZIP, EPub, Outlook .msg, YouTube links...) to Markdown - no
 * official REST API or maintained Node/TS library covers the same format
 * surface, same rationale as GarminConnector/CookidooConnector needing a
 * sidecar. Unlike those, there is no per-user login/session state at all:
 * conversion is a pure, stateless call, nothing to encrypt or persist.
 * `testConnection` only exists so this service can still get a `Credential`
 * row and a card on the Credentials page, mirroring LogsConnector - there is
 * nothing user-specific to test, it just confirms the sidecar is reachable.
 */
export abstract class MarkitdownConnector {
  abstract testConnection(): Promise<MarkitdownTestResult>;
  abstract convertUrl(url: string): Promise<MarkitdownConvertResult>;
  abstract convertContent(
    base64Content: string,
    filename?: string,
  ): Promise<MarkitdownConvertResult>;
}
