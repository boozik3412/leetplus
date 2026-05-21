import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  LangameCashTransaction,
  LangameClub,
  LangameGood,
  LangameGuest,
  LangameGuestBalance,
  LangameGuestBonusBalance,
  LangameGuestGroup,
  LangameGuestLog,
  LangameGuestSession,
  LangameOperationLog,
  LangamePcTypeInClub,
  LangamePcTypeLink,
  LangameProduct,
  LangameProductExpense,
  LangameTransaction,
  LangameWorkingShift,
} from './langame.types';

type LangameResponse<T> = {
  status?: boolean;
  data?: T[];
  message?: string;
};

type LangameQueryParams = Record<string, string>;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class LangameClient {
  async listClubs(baseUrl: string, apiKey: string) {
    return this.getList<LangameClub>(baseUrl, '/clubs/list', apiKey);
  }

  async listProducts(baseUrl: string, apiKey: string) {
    return this.getList<LangameProduct>(baseUrl, '/products/list', apiKey);
  }

  async listGoods(baseUrl: string, apiKey: string, clubId: number) {
    return this.getList<LangameGood>(baseUrl, '/goods/list', apiKey, {
      club_id: String(clubId),
    });
  }

  async listProductExpenses(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameProductExpense>(
      baseUrl,
      '/products/expense',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listGuests(baseUrl: string, apiKey: string) {
    return this.getList<LangameGuest>(baseUrl, '/guests/list', apiKey);
  }

  async listGuestGroups(baseUrl: string, apiKey: string) {
    return this.getList<LangameGuestGroup>(baseUrl, '/guests/groups', apiKey);
  }

  async listGuestBalances(baseUrl: string, apiKey: string) {
    return this.getList<LangameGuestBalance>(
      baseUrl,
      '/guests/balance',
      apiKey,
    );
  }

  async listGuestBonusBalances(baseUrl: string, apiKey: string) {
    return this.getList<LangameGuestBonusBalance>(
      baseUrl,
      '/guests/bonus_balance',
      apiKey,
    );
  }

  async listGuestSessions(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameGuestSession>(
      baseUrl,
      '/guests/sessions',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listGuestLogs(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameGuestLog>(
      baseUrl,
      '/guests/logs',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listTransactions(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameTransaction>(
      baseUrl,
      '/transactions/list',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listAllOperationsLog(
    baseUrl: string,
    apiKey: string,
    params: {
      dateFrom: string;
      dateTo: string;
      clubId?: string | number;
    },
  ) {
    const queryParams: LangameQueryParams = {
      date_from: params.dateFrom,
      date_to: params.dateTo,
    };

    if (params.clubId !== undefined) {
      queryParams.club_id = String(params.clubId);
    }

    return this.getListWithDateFallback<LangameOperationLog>(
      baseUrl,
      '/all_operations_log/list',
      apiKey,
      queryParams,
    );
  }

  async listCashTransactions(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameCashTransaction>(
      baseUrl,
      '/log_cash_transaction/list',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listWorkingShifts(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameWorkingShift>(
      baseUrl,
      '/working_shifts/list',
      apiKey,
      {
        page: String(params.page),
        page_limit: String(params.pageLimit),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listPcTypesInClubs(baseUrl: string, apiKey: string) {
    return this.getList<LangamePcTypeInClub>(
      baseUrl,
      '/global/types_of_pc_in_clubs/list',
      apiKey,
    );
  }

  async listPcTypeLinks(baseUrl: string, apiKey: string) {
    return this.getList<LangamePcTypeLink>(
      baseUrl,
      '/global/linking_pc_by_type/list',
      apiKey,
    );
  }

  private async getList<T>(
    baseUrl: string,
    path: string,
    apiKey: string,
    params: LangameQueryParams = {},
  ): Promise<T[]> {
    const url = new URL(`${this.normalizeBaseUrl(baseUrl)}${path}`);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      const errorDetails = await this.readErrorDetails(response);
      throw new BadRequestException(
        [
          `Langame ${path} failed: ${response.status} ${response.statusText}`,
          errorDetails,
        ]
          .filter(Boolean)
          .join(' - '),
      );
    }

    const payload = (await response.json()) as LangameResponse<T>;

    if (payload.status === false) {
      throw new BadRequestException(
        payload.message
          ? `Langame ${path} returned an error: ${payload.message}`
          : `Langame ${path} returned an error`,
      );
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }

  private async getListWithDateFallback<T>(
    baseUrl: string,
    path: string,
    apiKey: string,
    params: LangameQueryParams = {},
  ): Promise<T[]> {
    try {
      return await this.getList<T>(baseUrl, path, apiKey, params);
    } catch (error) {
      if (!this.shouldRetryWithEuropeanDates(error, params)) {
        throw error;
      }

      return this.getList<T>(
        baseUrl,
        path,
        apiKey,
        this.toEuropeanDateParams(params),
      );
    }
  }

  private shouldRetryWithEuropeanDates(
    error: unknown,
    params: LangameQueryParams,
  ) {
    const message = error instanceof Error ? error.message : '';

    return (
      message.includes('400') &&
      (this.isIsoDate(params.date_from) || this.isIsoDate(params.date_to))
    );
  }

  private toEuropeanDateParams(params: LangameQueryParams) {
    return {
      ...params,
      date_from: this.toEuropeanDate(params.date_from),
      date_to: this.toEuropeanDate(params.date_to),
    };
  }

  private isIsoDate(value?: string) {
    return Boolean(value && isoDatePattern.test(value));
  }

  private toEuropeanDate(value?: string) {
    if (!value || !isoDatePattern.test(value)) {
      return value ?? '';
    }

    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }

  private async readErrorDetails(response: Response) {
    try {
      const body = (await response.text()).trim();

      if (!body) {
        return '';
      }

      return this.compactErrorDetails(body);
    } catch {
      return '';
    }
  }

  private compactErrorDetails(body: string) {
    try {
      const payload = JSON.parse(body) as unknown;

      if (this.hasStringField(payload, 'message')) {
        return payload.message;
      }

      if (this.hasStringField(payload, 'error')) {
        return payload.error;
      }
    } catch {
      // Fall back to the raw text below.
    }

    return body.length > 500 ? `${body.slice(0, 500)}...` : body;
  }

  private hasStringField(
    payload: unknown,
    field: string,
  ): payload is Record<string, string> {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      field in payload &&
      typeof (payload as Record<string, unknown>)[field] === 'string'
    );
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }
}
