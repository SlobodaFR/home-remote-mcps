export interface CreateApiKeyResponseDto {
  id: string;
  label: string;
  /** Shown once. Never recoverable afterwards - only a new key can be issued. */
  rawKey: string;
  /** Ready-to-paste URL for Claude's "add custom connector" dialog. */
  mcpUrl: string;
  createdAt: string;
}
