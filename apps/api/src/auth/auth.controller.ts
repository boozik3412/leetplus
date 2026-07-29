import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type {
  ConfirmEmailDto,
  AcceptUserInviteDto,
  LoginDto,
  PreviewUserInviteDto,
  RegisterDto,
  ResendEmailVerificationDto,
} from './auth.dto';
import type { AuthenticatedUser } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    void dto;
    throw new ForbiddenException(
      'Самостоятельная регистрация временно отключена. Получите приглашение от администратора.',
    );
  }

  @Post('invites/preview')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  getInvite(
    @Body() dto: PreviewUserInviteDto,
    @Headers('content-type') contentType?: string,
  ) {
    this.assertInviteJson(contentType);
    return this.authService.getInvite(dto?.token);
  }

  @Post('invites/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  acceptInvite(
    @Body() dto: AcceptUserInviteDto,
    @Headers('content-type') contentType?: string,
  ) {
    this.assertInviteJson(contentType);
    return this.authService.acceptInvite(dto?.token, dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('confirm-email')
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.authService.confirmEmail(dto.token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  private assertInviteJson(contentType: string | undefined): void {
    const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      throw new UnsupportedMediaTypeException({
        message: 'Некорректный запрос приглашения',
        reasonCode: 'INVITE_REQUEST_MEDIA_TYPE_INVALID',
      });
    }
  }
}
