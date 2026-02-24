import * as assert from 'node:assert/strict';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { APP_ROLE, AppRole } from '@votes/shared';
import { AuthService } from '../src/auth/auth.service';
import { RolesGuard } from '../src/common/auth/roles.guard';

function createExecutionContext(userRoles: AppRole[]) {
  const handler = function handler() {};
  const cls = class TestClass {};
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user: { roles: userRoles } }),
    }),
  } as any;
}

type AsyncTest = () => Promise<void>;

async function run(name: string, test: AsyncTest): Promise<void> {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await run('roles guard allows request when no role metadata is set', async () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const allowed = guard.canActivate(createExecutionContext([APP_ROLE.VIEWER]));
    assert.equal(allowed, true);
  });

  await run('roles guard enforces required roles (admin/campaign_manager/viewer)', async () => {
    const reflector = {
      getAllAndOverride: (_key: string) => [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    assert.equal(guard.canActivate(createExecutionContext([APP_ROLE.VIEWER])), false);
    assert.equal(guard.canActivate(createExecutionContext([APP_ROLE.CAMPAIGN_MANAGER])), true);
    assert.equal(guard.canActivate(createExecutionContext([APP_ROLE.ADMIN])), true);
  });

  await run('roles guard denies when user has no roles and route requires one', async () => {
    const reflector = {
      getAllAndOverride: (_key: string) => [APP_ROLE.VIEWER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    assert.equal(guard.canActivate(createExecutionContext([])), false);
  });

  await run('auth login returns token and user roles in payload', async () => {
    const password = 'secret123';
    const passwordHash = await bcrypt.hash(password, 10);

    const usersService = {
      findByEmail: async (email: string) => ({
        id: 'u1',
        email,
        name: 'User One',
        passwordHash,
        role: APP_ROLE.CAMPAIGN_MANAGER,
      }),
    } as any;

    let signedPayload: any;
    const jwtService = {
      signAsync: async (payload: any) => {
        signedPayload = payload;
        return 'token-123';
      },
    } as any;

    const service = new AuthService(usersService, jwtService);
    const result = await service.login({ email: ' TEST@EXAMPLE.COM ', password });

    assert.equal(result.accessToken, 'token-123');
    assert.deepEqual(result.user.roles, [APP_ROLE.CAMPAIGN_MANAGER]);
    assert.deepEqual(signedPayload, {
      sub: 'u1',
      email: 'test@example.com',
      roles: [APP_ROLE.CAMPAIGN_MANAGER],
    });
  });

  await run('auth login throws bad request for missing credentials', async () => {
    const service = new AuthService({ findByEmail: async () => null } as any, { signAsync: async () => '' } as any);

    let threw = false;
    try {
      await service.login({ email: '', password: '' });
    } catch (error) {
      threw = true;
      assert.equal(error instanceof BadRequestException, true);
    }

    assert.equal(threw, true);
  });

  await run('auth login throws unauthorized for invalid password', async () => {
    const usersService = {
      findByEmail: async () => ({
        id: 'u1',
        email: 'user@example.com',
        name: 'User One',
        passwordHash: await bcrypt.hash('correct-password', 10),
        role: APP_ROLE.VIEWER,
      }),
    } as any;

    const service = new AuthService(usersService, { signAsync: async () => 'token' } as any);

    let threw = false;
    try {
      await service.login({ email: 'user@example.com', password: 'wrong-password' });
    } catch (error) {
      threw = true;
      assert.equal(error instanceof UnauthorizedException, true);
    }

    assert.equal(threw, true);
  });

  await run('auth login throws unauthorized when user is missing', async () => {
    const service = new AuthService({ findByEmail: async () => null } as any, { signAsync: async () => 'token' } as any);

    let threw = false;
    try {
      await service.login({ email: 'missing@example.com', password: 'anything' });
    } catch (error) {
      threw = true;
      assert.equal(error instanceof UnauthorizedException, true);
    }

    assert.equal(threw, true);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
