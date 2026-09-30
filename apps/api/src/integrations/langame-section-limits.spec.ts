import { TenantModule } from '@prisma/client';
import {
  LANGAME_SECTION_NO_ACCESS_MESSAGE,
  LANGAME_SECTION_NOT_LISTED_MESSAGE,
  isLangameSectionLimitMessage,
  langameImportRequirements,
  langameSectionLimitMessage,
} from './langame-section-limits';

describe('Langame section limits', () => {
  it.each([
    'Langame /products/groups/active returned an error: No permissions to access this route',
    'Langame /guests/list failed: 403 Forbidden',
    'Langame /guests/list failed: 401 Unauthorized',
  ])('treats a permission denial as no access: %s', (message) => {
    expect(langameSectionLimitMessage(new Error(message))).toBe(
      LANGAME_SECTION_NO_ACCESS_MESSAGE,
    );
  });

  it('treats the guest_id requirement of the network-wide guest log as a limit', () => {
    const error = new Error(
      'Langame /guests/logs failed: 400 Bad Request - {"type":"https://tools.ietf.org/html/rfc2616#section-10","title":"An error occurred","status":400,"detail":"Validation failed","violations":[{"field":"guest_id","error":"Значение не должно быть пустым."}]}',
    );
    expect(langameSectionLimitMessage(error)).toBe(
      LANGAME_SECTION_NOT_LISTED_MESSAGE,
    );
  });

  it.each([
    'Langame /guests/logs failed: 400 Bad Request - {"violations":[{"field":"date_from","error":"invalid"}]}',
    'Langame /guests/sessions failed: 500 Internal Server Error',
    'socket hang up',
  ])('keeps other failures incomplete: %s', (message) => {
    expect(langameSectionLimitMessage(new Error(message))).toBeNull();
  });

  it('recognizes only its own limit messages', () => {
    expect(
      isLangameSectionLimitMessage(LANGAME_SECTION_NO_ACCESS_MESSAGE),
    ).toBe(true);
    expect(
      isLangameSectionLimitMessage(LANGAME_SECTION_NOT_LISTED_MESSAGE),
    ).toBe(true);
    expect(
      isLangameSectionLimitMessage(
        'Не удалось получить данные этого раздела Langame.',
      ),
    ).toBe(false);
  });

  it('requires WRITE, never OUTBOUND, for the scheduled import', () => {
    expect(
      langameImportRequirements([
        TenantModule.INTEGRATIONS,
        TenantModule.GAMIFICATION,
      ]),
    ).toEqual([
      { module: TenantModule.INTEGRATIONS, action: 'WRITE' },
      { module: TenantModule.GAMIFICATION, action: 'WRITE' },
    ]);
  });
});
