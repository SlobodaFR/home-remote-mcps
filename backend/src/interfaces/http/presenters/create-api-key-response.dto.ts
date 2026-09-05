export interface CreateApiKeyResponseDto {
  id: string;
  label: string;
  /** Shown once. Never recoverable afterwards - only a new key can be issued. */
  rawKey: string;
  /** Ready-to-paste URL for Claude's "add custom connector" dialog (Garmin). */
  mcpUrl: string;
  /** Same key, Home Assistant MCP endpoint - add as a second custom connector in Claude. */
  homeAssistantMcpUrl: string;
  /** Same key, Cookidoo MCP endpoint - add as another custom connector in Claude. */
  cookidooMcpUrl: string;
  /** Same key, Docker container logs (MinIO/Vector) MCP endpoint - add as another custom connector in Claude. */
  logsMcpUrl: string;
  /** Same key, personal-health (health.sloboda.fr) MCP endpoint - add as another custom connector in Claude. */
  personalHealthMcpUrl: string;
  /** Same key, YouTube MCP endpoint - add as another custom connector in Claude. */
  youtubeMcpUrl: string;
  /**
   * Same key, Instagram MCP endpoint template - ends in a placeholder
   * because Instagram supports several accounts per user: replace
   * "<account-name>" with the name chosen when connecting that account on
   * the Credentials page.
   */
  instagramMcpUrlTemplate: string;
  /**
   * Same key, OpenAI MCP endpoint template - ends in a placeholder because
   * a user can hold several OpenAI API keys: replace "<connection-name>"
   * with the name chosen when connecting that key on the Credentials page.
   */
  openaiMcpUrlTemplate: string;
  createdAt: string;
}
