import {
  Body,
  Controller,
  INestApplication,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GUEST_BUG_REPORT_MULTIPART_LIMITS } from './guest-support.service';

@Controller('multipart-fixture')
class MultipartFixtureController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: GUEST_BUG_REPORT_MULTIPART_LIMITS }),
  )
  accept(
    @Body() body: Record<string, string>,
    @UploadedFile() file?: { buffer: Uint8Array },
  ) {
    return {
      fields: Object.keys(body).sort(),
      fileBytes: file?.buffer.byteLength ?? 0,
    };
  }
}

describe('guest bug-report multipart envelope', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MultipartFixtureController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts the canonical five fields and one screenshot', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/multipart-fixture')
      .field('topic', 'INTERFACE_AND_DISPLAY')
      .field('description', 'Описание длиной больше двадцати символов')
      .field('route', '/game')
      .field('viewport', '390x844')
      .field('timeZone', 'Asia/Yekaterinburg')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
        filename: 'screen.jpg',
      })
      .expect(201)
      .expect({
        fields: ['description', 'route', 'timeZone', 'topic', 'viewport'],
        fileBytes: 4,
      });
  });

  it('still rejects a sixth text field', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/multipart-fixture')
      .field('topic', 'INTERFACE_AND_DISPLAY')
      .field('description', 'Описание длиной больше двадцати символов')
      .field('route', '/game')
      .field('viewport', '390x844')
      .field('timeZone', 'Asia/Yekaterinburg')
      .field('unexpected', 'blocked')
      .expect(400);
  });
});
