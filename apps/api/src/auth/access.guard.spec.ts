import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionUser } from '@fernleaf/shared';
import { ForbiddenError, UnauthenticatedError } from '../common/errors/domain-error.js';
import { Authenticated, Public, RequirePermissions } from './access.decorators.js';
import { AccessGuard } from './access.guard.js';
import type { SessionService } from './session.service.js';

class ExampleController {
  @Public()
  open() {}

  @Authenticated()
  whoAmI() {}

  @RequirePermissions('ORDERS_WRITE')
  placeOrder() {}

  @RequirePermissions('KITCHEN_READ', 'KITCHEN_WORK')
  markUnitDone() {}

  undeclared() {}
}

@RequirePermissions('BILLING_READ')
class BillingController {
  listInvoices() {}

  @Public()
  publicSummary() {}
}

const kitchenUser: SessionUser = {
  id: 'u-kitchen',
  name: 'Rahul Verma',
  email: 'kitchen@test.com',
  role: { key: 'kitchen', name: 'Kitchen', homeDashboard: 'KITCHEN' },
  permissions: ['KITCHEN_READ', 'KITCHEN_WORK', 'CATALOGUE_READ'],
};

function contextFor(controller: object, handler: unknown, request: object = {}) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** A guard whose session lookup returns `user`, or fails with 401 when `user` is null. */
function guardFor(user: SessionUser | null) {
  const authenticate = vi.fn(async () => {
    if (!user) throw new UnauthenticatedError();
    return user;
  });
  const guard = new AccessGuard(new Reflector(), { authenticate } as unknown as SessionService);
  return { guard, authenticate };
}

describe('AccessGuard', () => {
  it('closes a route that declares no access rule, even for a signed-in user', async () => {
    const { guard, authenticate } = guardFor(kitchenUser);
    const run = guard.canActivate(
      contextFor(ExampleController, ExampleController.prototype.undeclared),
    );

    await expect(run).rejects.toMatchObject({ statusCode: 403, code: 'ACCESS_RULE_MISSING' });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('lets anyone reach a @Public() route without checking the session', async () => {
    const { guard, authenticate } = guardFor(null);
    await expect(
      guard.canActivate(contextFor(ExampleController, ExampleController.prototype.open)),
    ).resolves.toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('requires a valid session for @Authenticated() and puts the user on the request', async () => {
    const request: { user?: SessionUser } = {};
    await expect(
      guardFor(null).guard.canActivate(
        contextFor(ExampleController, ExampleController.prototype.whoAmI, request),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    await expect(
      guardFor(kitchenUser).guard.canActivate(
        contextFor(ExampleController, ExampleController.prototype.whoAmI, request),
      ),
    ).resolves.toBe(true);
    expect(request.user).toBe(kitchenUser);
  });

  it('refuses a signed-in user whose role lacks a required permission', async () => {
    const run = guardFor(kitchenUser).guard.canActivate(
      contextFor(ExampleController, ExampleController.prototype.placeOrder),
    );
    await expect(run).rejects.toBeInstanceOf(ForbiddenError);
    await expect(run).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('needs every listed permission, not just one of them', async () => {
    const onlyRead = { ...kitchenUser, permissions: ['KITCHEN_READ' as const] };
    await expect(
      guardFor(onlyRead).guard.canActivate(
        contextFor(ExampleController, ExampleController.prototype.markUnitDone),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      guardFor(kitchenUser).guard.canActivate(
        contextFor(ExampleController, ExampleController.prototype.markUnitDone),
      ),
    ).resolves.toBe(true);
  });

  it('applies a controller-wide rule, and lets a method override it', async () => {
    const { guard } = guardFor(kitchenUser);
    await expect(
      guard.canActivate(contextFor(BillingController, BillingController.prototype.listInvoices)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      guard.canActivate(contextFor(BillingController, BillingController.prototype.publicSummary)),
    ).resolves.toBe(true);
  });

  it('works for a brand-new role with no code changes - only its permissions matter', async () => {
    const qualityInspector: SessionUser = {
      ...kitchenUser,
      role: { key: 'quality-inspector', name: 'Quality inspector', homeDashboard: 'KITCHEN' },
      permissions: ['KITCHEN_READ', 'KITCHEN_WORK'],
    };
    await expect(
      guardFor(qualityInspector).guard.canActivate(
        contextFor(ExampleController, ExampleController.prototype.markUnitDone),
      ),
    ).resolves.toBe(true);
  });
});
