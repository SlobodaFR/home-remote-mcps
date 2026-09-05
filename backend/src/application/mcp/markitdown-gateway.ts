import { Injectable } from '@nestjs/common';
import {
  MarkitdownConnector,
  MarkitdownConvertResult,
} from '../../domain/markitdown/markitdown-connector';

/**
 * Unlike every other *DataGateway, there is no per-user credential to load,
 * decrypt, or rotate - conversion is stateless and shared across all users.
 * Kept as a thin pass-through purely so the MCP controller follows the same
 * controller -> gateway -> connector shape as every other integration.
 */
@Injectable()
export class MarkitdownGateway {
  constructor(private readonly markitdownConnector: MarkitdownConnector) {}

  convertUrl(url: string): Promise<MarkitdownConvertResult> {
    return this.markitdownConnector.convertUrl(url);
  }

  convertContent(
    base64Content: string,
    filename?: string,
  ): Promise<MarkitdownConvertResult> {
    return this.markitdownConnector.convertContent(base64Content, filename);
  }
}
