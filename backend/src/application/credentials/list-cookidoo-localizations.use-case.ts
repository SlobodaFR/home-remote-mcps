import { Injectable } from '@nestjs/common';
import {
  CookidooConnector,
  CookidooLocalization,
} from '../../domain/cookidoo/cookidoo-connector';

/** Feeds the country/language selects on the Cookidoo credentials form. */
@Injectable()
export class ListCookidooLocalizationsUseCase {
  constructor(private readonly cookidooConnector: CookidooConnector) {}

  execute(
    country?: string,
    language?: string,
  ): Promise<CookidooLocalization[]> {
    return this.cookidooConnector.listLocalizations(country, language);
  }
}
