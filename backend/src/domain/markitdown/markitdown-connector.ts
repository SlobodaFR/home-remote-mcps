export interface MarkitdownConvertResult {
  markdown: string;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * markitdown-connector Python sidecar, which wraps Microsoft's `markitdown`
 * library to convert documents/URLs (PDF, Office docs, images, HTML,
 * CSV/JSON/XML, ZIP, EPub, Outlook .msg, YouTube links...) to Markdown - no
 * official REST API or maintained Node/TS library covers the same format
 * surface, same rationale as GarminConnector/CookidooConnector needing a
 * sidecar. Unlike those, there is no per-user login/session state at all:
 * conversion is a pure, stateless call, nothing to encrypt or persist.
 */
export abstract class MarkitdownConnector {
  abstract convertUrl(url: string): Promise<MarkitdownConvertResult>;
  abstract convertContent(
    base64Content: string,
    filename?: string,
  ): Promise<MarkitdownConvertResult>;
}
