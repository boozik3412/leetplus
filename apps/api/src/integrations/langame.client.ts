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
    return this.getList<LangameProductExpense>(
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
    return this.getList<LangameGuestSession>(
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
    return this.getList<LangameGuestLog>(baseUrl, '/guests/logs', apiKey, {
      page: String(params.page),
      page_limit: String(params.pageLimit),
      date_from: params.dateFrom,
      date_to: params.dateTo,
    });
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
    return this.getList<LangameTransaction>(
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
    const queryParams: Record<string, string> = {
      date_from: params.dateFrom,
      date_to: params.dateTo,
    };

    if (params.clubId !== undefined) {
      queryParams.club_id = String(params.clubId);
    }

    return this.getList<LangameOperationLog>(
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
    return this.getList<LangameCashTransaction>(
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
    return this.getList<LangameWorkingShift>(
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

  private async getList<T>(
    baseUrl: string,
    path: string,
    apiKey: string,
    params: Record<string, string> = {},
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
      throw new BadRequestException(
        `LAngame request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as LangameResponse<T>;

    if (payload.status === false) {
      throw new BadRequestException(
        payload.message || 'LAngame request returned an error',
      );
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }
}
