import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  LangameClub,
  LangameGood,
  LangameOperationLog,
  LangameProduct,
  LangameProductExpense,
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
