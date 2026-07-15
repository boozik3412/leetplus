import { detectImageContentType } from './guest-game-media.service';

describe('GuestGameMediaService image validation', () => {
  it('detects supported formats by file signature', () => {
    expect(
      detectImageContentType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    );
    expect(detectImageContentType(Buffer.from('RIFF0000WEBP', 'ascii'))).toBe(
      'image/webp',
    );
  });

  it('rejects content that only claims to be an image', () => {
    expect(
      detectImageContentType(Buffer.from('<script>alert(1)</script>')),
    ).toBe(null);
  });
});
