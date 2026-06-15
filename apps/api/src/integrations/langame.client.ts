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
  LangameUser,
  LangameWorkingShift,
} from './langame.types';

type LangameResponse<T> = {
  status?: boolean;
  data?: T[];
  message?: string;
};

type LangameQueryParams = Record<string, string>;
type LangameBalanceType = 'balance' | 'bonus_balance';

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

  async listGuests(
    baseUrl: string,
    apiKey: string,
    params?: { page: number; pageLimit: number },
  ) {
    return this.getList<LangameGuest>(
      baseUrl,
      '/guests/list',
      apiKey,
      params
        ? {
            page: String(params.page),
            page_limit: String(params.pageLimit),
          }
        : undefined,
    );
  }

  async listGuestGroups(baseUrl: string, apiKey: string) {
    return this.getList<LangameGuestGroup>(baseUrl, '/guests/groups', apiKey);
  }

  async listGuestBalances(
    baseUrl: string,
    apiKey: string,
    params?: { page: number; pageLimit: number },
  ) {
    return this.getList<LangameGuestBalance>(
      baseUrl,
      '/guests/balance',
      apiKey,
      params
        ? {
            page: String(params.page),
            page_limit: String(params.pageLimit),
          }
        : undefined,
    );
  }

  async listGuestBonusBalances(
    baseUrl: string,
    apiKey: string,
    params?: { page: number; pageLimit: number },
  ) {
    return this.getList<LangameGuestBonusBalance>(
      baseUrl,
      '/guests/bonus_balance',
      apiKey,
      params
        ? {
            page: String(params.page),
            page_limit: String(params.pageLimit),
          }
        : undefined,
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
      operationType?: string;
      operationSource?: string;
      operationForm?: string;
    },
  ) {
    const queryParams: LangameQueryParams = {
      date_from: params.dateFrom,
      date_to: params.dateTo,
    };

    if (params.clubId !== undefined) {
      queryParams.club_id = String(params.clubId);
    }
    if (params.operationType) {
      queryParams.operation_type = params.operationType;
    }
    if (params.operationSource) {
      queryParams.operation_source = params.operationSource;
    }
    if (params.operationForm) {
      queryParams.operation_form = params.operationForm;
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
      clubId: string | number;
      dateFrom: string;
      dateTo: string;
    },
  ) {
    return this.getListWithDateFallback<LangameCashTransaction>(
      baseUrl,
      '/log_cash_transaction/list',
      apiKey,
      {
        club_id: String(params.clubId),
        date_from: params.dateFrom,
        date_to: params.dateTo,
      },
    );
  }

  async listUsers(
    baseUrl: string,
    apiKey: string,
    params: {
      page: number;
      pageLimit: number;
    },
  ) {
    return this.getList<LangameUser>(baseUrl, '/users/list', apiKey, {
      page: String(params.page),
      page_limit: String(params.pageLimit),
    });
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

  async getRoutes(baseUrl: string, apiKey: string) {
    const url = new URL(`${this.normalizeBaseUrl(baseUrl)}/routes`);
    url.searchParams.set('api_key', apiKey);

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
          `Langame /routes failed: ${response.status} ${response.statusText}`,
          errorDetails,
        ]
          .filter(Boolean)
          .join(' - '),
      );
    }

    return this.readJsonOrText(response);
  }

  async getDiagnosticEndpoint(
    baseUrl: string,
    apiKey: string,
    path: string,
    params: LangameQueryParams = {},
  ) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.normalizeBaseUrl(baseUrl)}${normalizedPath}`);

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
          `Langame ${normalizedPath} failed: ${response.status} ${response.statusText}`,
          errorDetails,
        ]
          .filter(Boolean)
          .join(' - '),
      );
    }

    const result = await this.readJsonOrText(response);

    if (this.isPlainObject(result) && result.status === false) {
      throw new BadRequestException(
        this.hasStringField(result, 'message')
          ? `Langame ${normalizedPath} returned an error: ${result.message}`
          : `Langame ${normalizedPath} returned an error`,
      );
    }

    return result;
  }

  async searchGuests(
    baseUrl: string,
    apiKey: string,
    payload: Record<string, string>,
  ) {
    const path = '/guests/search';
    const url = new URL(`${this.normalizeBaseUrl(baseUrl)}${path}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
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

    const result = await this.readJsonOrText(response);

    if (this.isPlainObject(result) && result.status === false) {
      throw new BadRequestException(
        this.hasStringField(result, 'message')
          ? `Langame ${path} returned an error: ${result.message}`
          : `Langame ${path} returned an error`,
      );
    }

    return result;
  }

  async postEndpoint(
    baseUrl: string,
    apiKey: string,
    path: string,
    payload: Record<string, unknown>,
  ) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.normalizeBaseUrl(baseUrl)}${normalizedPath}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorDetails = await this.readErrorDetails(response);
      throw new BadRequestException(
        [
          `Langame ${normalizedPath} failed: ${response.status} ${response.statusText}`,
          errorDetails,
        ]
          .filter(Boolean)
          .join(' - '),
      );
    }

    const result = await this.readJsonOrText(response);

    if (this.isPlainObject(result) && result.status === false) {
      throw new BadRequestException(
        this.hasStringField(result, 'message')
          ? `Langame ${normalizedPath} returned an error: ${result.message}`
          : `Langame ${normalizedPath} returned an error`,
      );
    }

    return result;
  }

  async adjustGuestBalanceByPhone(
    baseUrl: string,
    requestToken: string,
    payload: {
      phone: string;
      type: LangameBalanceType;
      sum: number;
      comment: string;
    },
    path = '/guests/balance/phone',
  ) {
    const normalizedPath = this.masterApiPath(path);
    const displayPath = `/master_api${normalizedPath}`;
    const url = new URL(`${this.masterApiBaseUrl(baseUrl)}${normalizedPath}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Token': requestToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorDetails = await this.readErrorDetails(response);
      throw new BadRequestException(
        [
          `Langame ${displayPath} failed: ${response.status} ${response.statusText}`,
          errorDetails,
        ]
          .filter(Boolean)
          .join(' - '),
      );
    }

    const result = await this.readJsonOrText(response);

    if (this.isPlainObject(result) && result.status === false) {
      throw new BadRequestException(
        this.hasStringField(result, 'message')
          ? `Langame ${displayPath} returned an error: ${result.message}`
          : `Langame ${displayPath} returned an error`,
      );
    }

    return result;
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
      const rows = await this.getList<T>(baseUrl, path, apiKey, params);

      if (rows.length > 0 || !this.shouldRetryEmptyWithEuropeanDates(params)) {
        return rows;
      }

      return this.getList<T>(
        baseUrl,
        path,
        apiKey,
        this.toEuropeanDateParams(params),
      );
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

  private shouldRetryEmptyWithEuropeanDates(params: LangameQueryParams) {
    return this.isIsoDate(params.date_from) || this.isIsoDate(params.date_to);
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

  private async readJsonOrText(response: Response) {
    const body = await response.text();

    if (!body.trim()) {
      return null;
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      return this.compactErrorDetails(body);
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

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }

  private masterApiBaseUrl(baseUrl: string) {
    const normalized = this.normalizeBaseUrl(baseUrl);

    if (normalized.endsWith('/master_api')) {
      return normalized;
    }

    if (normalized.endsWith('/public_api')) {
      return `${normalized.slice(0, -'/public_api'.length)}/master_api`;
    }

    return `${normalized}/master_api`;
  }

  private masterApiPath(path: string) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return normalizedPath.startsWith('/master_api/')
      ? normalizedPath.slice('/master_api'.length)
      : normalizedPath;
  }
}
