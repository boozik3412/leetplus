import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  UsersService,
  type UserAccount,
  type UserAccountDto,
  type UserAccessRoleAccount,
  type UserAccessRoleDto,
  type UserAccountsResponse,
  type UserInviteAccount,
  type UserInviteDto,
} from './users.service';

@Controller('users')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STANDARDS_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserAccountsResponse> {
    return this.usersService.getUsers(user);
  }

  @Post()
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UserAccountDto,
  ): Promise<UserAccount> {
    return this.usersService.createUser(user, dto);
  }

  @Post('invites')
  createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UserInviteDto,
  ): Promise<UserInviteAccount> {
    return this.usersService.createInvite(user, dto);
  }

  @Patch(':id')
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UserAccountDto,
  ): Promise<UserAccount> {
    return this.usersService.updateUser(user, id, dto);
  }

  @Post('roles')
  createAccessRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UserAccessRoleDto,
  ): Promise<UserAccessRoleAccount> {
    return this.usersService.createAccessRole(user, dto);
  }

  @Patch('roles/:id')
  updateAccessRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UserAccessRoleDto,
  ): Promise<UserAccessRoleAccount> {
    return this.usersService.updateAccessRole(user, id, dto);
  }
}
