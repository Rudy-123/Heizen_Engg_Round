import {
  deliveredOnTime,
  dropStage,
  dropStepProblem,
  kitchenRisk,
  type DropProgress,
} from './operations.js';

const at = (time: string) => new Date(`2027-04-07T${time}:00+05:30`);

describe('kitchenRisk', () => {
  const order = { kitchenReadyAt: null, plannedKitchenReadyAt: at('11:00') };

  it('is on track until the at-risk window opens', () => {
    expect(kitchenRisk(order, at('10:29'), 30)).toBe('ON_TRACK');
  });

  it('is at risk inside the window, up to and including the planned time', () => {
    expect(kitchenRisk(order, at('10:30'), 30)).toBe('AT_RISK');
    expect(kitchenRisk(order, at('11:00'), 30)).toBe('AT_RISK');
  });

  it('is late once the planned kitchen-ready time has passed', () => {
    expect(kitchenRisk(order, at('11:01'), 30)).toBe('LATE');
  });

  it('is never late or at risk once ready, even if it was ready late', () => {
    expect(kitchenRisk({ ...order, kitchenReadyAt: at('11:20') }, at('12:00'), 30)).toBe('READY');
  });
});

describe('drop stages and steps', () => {
  const fresh: DropProgress = {
    dispatchReadyAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    driverId: null,
    orders: 3,
    ordersReady: 2,
  };

  it('is kitchen ready only when every order in it is', () => {
    expect(dropStage(fresh)).toBe('AWAITING_KITCHEN');
    expect(dropStage({ ...fresh, ordersReady: 3 })).toBe('KITCHEN_READY');
    expect(dropStage({ ...fresh, orders: 0, ordersReady: 0 })).toBe('AWAITING_KITCHEN');
  });

  it('refuses dispatch ready while an order is still in the kitchen', () => {
    expect(dropStepProblem('DISPATCH_READY', fresh)).toEqual({
      kind: 'OUT_OF_ORDER',
      message: '1 of its 3 orders is still in the kitchen.',
    });
    expect(dropStepProblem('DISPATCH_READY', { ...fresh, ordersReady: 3 })).toBeNull();
  });

  it('needs dispatch ready and a driver before going out', () => {
    const packed = { ...fresh, ordersReady: 3, dispatchReadyAt: at('11:30') };
    expect(dropStepProblem('OUT_FOR_DELIVERY', { ...fresh, ordersReady: 3 })?.message).toBe(
      'Mark it dispatch ready first.',
    );
    expect(dropStepProblem('OUT_FOR_DELIVERY', packed)?.message).toBe('Assign a driver first.');
    expect(dropStepProblem('OUT_FOR_DELIVERY', { ...packed, driverId: 'd1' })).toBeNull();
  });

  it('can only be delivered once it is out, and no step happens twice', () => {
    const out = {
      ...fresh,
      ordersReady: 3,
      dispatchReadyAt: at('11:30'),
      outForDeliveryAt: at('11:35'),
      driverId: 'd1',
    };
    expect(dropStepProblem('DELIVERED', { ...out, outForDeliveryAt: null })?.kind).toBe(
      'OUT_OF_ORDER',
    );
    expect(dropStepProblem('DELIVERED', out)).toBeNull();
    expect(dropStepProblem('DISPATCH_READY', out)?.kind).toBe('REPEATED');
    expect(dropStepProblem('OUT_FOR_DELIVERY', out)?.kind).toBe('REPEATED');
    expect(dropStepProblem('DELIVERED', { ...out, deliveredAt: at('12:30') })?.kind).toBe(
      'REPEATED',
    );
    expect(dropStage({ ...out, deliveredAt: at('12:30') })).toBe('DELIVERED');
  });
});

describe('deliveredOnTime', () => {
  it('counts a delivery within the grace minutes as on time', () => {
    expect(deliveredOnTime(at('12:40'), at('12:30'), 10)).toBe(true);
    expect(deliveredOnTime(at('12:41'), at('12:30'), 10)).toBe(false);
    expect(deliveredOnTime(at('12:00'), at('12:30'), 0)).toBe(true);
  });
});
