import 'reflect-metadata';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { ACCESS_RULE, type AccessRule } from '../src/auth/access.decorators.js';

/**
 * Safety net for "permissions must be enforced on the server": walks every route in the
 * app and fails if any route forgot to declare who may call it. (Such a route would be
 * closed by AccessGuard anyway - this test makes the mistake visible at build time.)
 */
describe('Access rules (e2e)', () => {
  it('every route declares @Public(), @Authenticated() or @RequirePermissions()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    const discovery = moduleRef.get(DiscoveryService);
    const reflector = moduleRef.get(Reflector);
    const scanner = new MetadataScanner();

    const routes: { route: string; rule: AccessRule | undefined }[] = [];
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as object;
        const isRoute = Reflect.getMetadata('path', handler) !== undefined;
        if (!isRoute) continue;
        routes.push({
          route: `${metatype.name}.${name}`,
          rule: reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
            handler as () => void,
            metatype,
          ]),
        });
      }
    }

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => r.rule === undefined).map((r) => r.route)).toEqual([]);
    await moduleRef.close();
  });
});
