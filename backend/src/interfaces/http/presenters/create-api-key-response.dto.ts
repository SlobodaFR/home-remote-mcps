export interface CreateApiKeyResponseDto {
  id: string;
  label: string;
  /** Shown once. Never recoverable afterwards - only a new key can be issued. */
  rawKey: string;
  /** Ready-to-paste URL for Claude's "add custom connector" dialog (Garmin). */
  mcpUrl: string;
  /** Same key, Home Assistant MCP endpoint - add as a second custom connector in Claude. */
  homeAssistantMcpUrl: string;
  /** Same key, personal-health (health.sloboda.fr) MCP endpoint - add as another custom connector in Claude. */
  personalHealthMcpUrl: string;
  /** Same key, YouTube MCP endpoint - add as another custom connector in Claude. */
  youtubeMcpUrl: string;
  createdAt: string;
}
