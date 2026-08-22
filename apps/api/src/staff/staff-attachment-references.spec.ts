import { BadRequestException } from '@nestjs/common';
import {
  extractStaffAttachmentIds,
  isExactStaffAttachmentUrl,
} from './staff-attachment-references';

describe('extractStaffAttachmentIds', () => {
  it('recognizes only exact native attachment URLs', () => {
    expect(
      isExactStaffAttachmentUrl(
        '/api/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).toBe(true);
    expect(
      isExactStaffAttachmentUrl(
        'https://leetplus.ru/api/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).toBe(false);
  });

  it('extracts sorted unique native references from nested staff content', () => {
    expect(
      extractStaffAttachmentIds([
        {
          content:
            '<a href="/api/staff/attachments/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA">file</a>',
          steps: [
            {
              attachments: [
                {
                  url: '/staff/attachments/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                },
              ],
            },
          ],
        },
        '/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ]),
    ).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ]);
  });

  it('ignores ordinary and external URLs', () => {
    expect(
      extractStaffAttachmentIds([
        'https://example.com/manual.pdf',
        { url: '/staff/training-courses/course-a' },
      ]),
    ).toEqual([]);
  });

  it('rejects an absolute external URL that mimics the native attachment route', () => {
    expect(() =>
      extractStaffAttachmentIds([
        'https://evil.example/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ]),
    ).toThrow('Invalid attachment references');
  });

  it.each([
    '/staff/attachments/not-a-uuid',
    '/api/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?download=1',
    '/staff/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/extra',
  ])('rejects malformed native reference %s', (value) => {
    expect(() => extractStaffAttachmentIds([value])).toThrow(
      BadRequestException,
    );
  });

  it('rejects cyclic or accessor-bearing input without invoking an accessor', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => extractStaffAttachmentIds([cyclic])).toThrow(
      'Invalid attachment references',
    );

    const getter = jest.fn(() => '/staff/attachments/not-safe');
    const accessor = Object.defineProperty({}, 'url', { get: getter });
    expect(() => extractStaffAttachmentIds([accessor])).toThrow(
      'Invalid attachment references',
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('fails closed when the traversal node limit is exceeded', () => {
    expect(() =>
      extractStaffAttachmentIds([Array.from({ length: 20_001 }, () => null)]),
    ).toThrow('Invalid attachment references');
  });
});
