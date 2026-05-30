import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type {
  ConfirmEmailDto,
  AcceptUserInviteDto,
  LoginDto,
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
    return this.authService.register(dto);
  }

  @Get('invites/:token')
  getInvite(@Param('token') token: string) {
    return this.authService.getInvite(token);
  }

  @Post('invites/:token/accept')
  acceptInvite(
    @Param('token') token: string,
    @Body() dto: AcceptUserInviteDto,
  ) {
    return this.authService.acceptInvite(token, dto);
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
}
