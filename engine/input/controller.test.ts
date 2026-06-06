/**
 * Offline tests for engine/input/controller — no DOM, no gamepad hardware: fake event sources
 * and a fake gamepad provider exercise the typed action set, edges, analog values, and the
 * playtester's programmatic injection path.
 */
import assert from 'node:assert/strict';
import {
  ActionMapSchema,
  createController,
  type EventSourceLike,
  type GamepadLike,
  type GamepadProviderLike,
} from './controller';

const TEST_LOG_PREFIX = '[engine/input/controller.test]';

class FakeEventSource implements EventSourceLike {
  private readonly handlers = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(listener);
    this.handlers.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.handlers.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }
}

class FakeGamepadProvider implements GamepadProviderLike {
  pads: Array<GamepadLike | null> = [];
  getGamepads(): ReadonlyArray<GamepadLike | null> {
    return this.pads;
  }
}

const BINDINGS = {
  jump: { keyboard: ['Space'], gamepadButtons: [0], touchZones: ['btn-a'] },
  left: { keyboard: ['ArrowLeft', 'KeyA'] },
  fire: { gamepadButtons: [7] },
};

type TestFn = () => void;
const tests: Array<[string, TestFn]> = [];
function test(name: string, fn: TestFn): void {
  tests.push([name, fn]);
}

test('ActionMapSchema rejects invalid bindings and constructor throws', () => {
  assert.equal(ActionMapSchema.safeParse({ jump: { keyboard: [''] } }).success, false);
  assert.throws(() => createController({ bindings: { bad: { gamepadButtons: [-1] } } }));
});

test('keyboard events drive active state and pressed/released edges', () => {
  const src = new FakeEventSource();
  const c = createController({ bindings: BINDINGS, keyboardSource: src });
  c.attach();

  src.emit('keydown', { code: 'Space' });
  c.poll();
  assert.equal(c.isActive('jump'), true);
  assert.equal(c.isPressed('jump'), true);
  assert.equal(c.getValue('jump'), 1);
  c.endFrame();

  c.poll();
  assert.equal(c.isActive('jump'), true);
  assert.equal(c.isPressed('jump'), false, 'no rising edge while held');
  c.endFrame();

  src.emit('keyup', { code: 'Space' });
  c.poll();
  assert.equal(c.isActive('jump'), false);
  assert.equal(c.isReleased('jump'), true);
  c.detach();
});

test('multiple keyboard codes map to the same action', () => {
  const src = new FakeEventSource();
  const c = createController({ bindings: BINDINGS, keyboardSource: src });
  c.attach();
  src.emit('keydown', { code: 'KeyA' });
  c.poll();
  assert.equal(c.isActive('left'), true);
  src.emit('keydown', { code: 'ArrowLeft' });
  src.emit('keyup', { code: 'KeyA' });
  c.poll();
  assert.equal(c.isActive('left'), true, 'still held via second binding');
  c.detach();
});

test('unbound keys and unknown zones are ignored', () => {
  const src = new FakeEventSource();
  const c = createController({ bindings: BINDINGS, keyboardSource: src });
  c.attach();
  src.emit('keydown', { code: 'KeyZ' });
  src.emit('touchzonedown', { zone: 'nope' });
  c.poll();
  assert.deepEqual(
    Object.values(c.snapshot()).map((s) => s.active),
    [false, false, false],
  );
  c.detach();
});

test('touch zones drive bound actions', () => {
  const src = new FakeEventSource();
  const c = createController({ bindings: BINDINGS, keyboardSource: src });
  c.attach();
  src.emit('touchzonedown', { zone: 'btn-a' });
  c.poll();
  assert.equal(c.isActive('jump'), true);
  src.emit('touchzoneup', { zone: 'btn-a' });
  c.poll();
  assert.equal(c.isReleased('jump'), true);
  c.detach();
});

test('gamepad buttons drive digital + analog state with deadzone', () => {
  const pads = new FakeGamepadProvider();
  const c = createController({ bindings: BINDINGS, gamepadProvider: pads, gamepadDeadzone: 0.2 });
  const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
  pads.pads = [{ buttons, axes: [] }];

  buttons[7] = { pressed: false, value: 0.1 }; // below deadzone
  c.poll();
  assert.equal(c.isActive('fire'), false, 'deadzone filters drift');

  buttons[7] = { pressed: false, value: 0.6 }; // analog trigger above deadzone
  c.poll();
  assert.equal(c.isActive('fire'), true);
  // value > deadzone also counts as digitally pressed, so magnitude saturates to 1
  assert.equal(c.getValue('fire'), 1);

  buttons[7] = { pressed: false, value: 0 };
  c.poll();
  assert.equal(c.isReleased('fire'), true);
});

test('playtester injection: inject/injectAxis/tap, and unknown actions throw', () => {
  const c = createController({ bindings: BINDINGS });

  c.inject('jump', true);
  c.poll();
  assert.equal(c.isPressed('jump'), true);
  c.endFrame();
  c.inject('jump', false);
  c.poll();
  assert.equal(c.isReleased('jump'), true);

  c.injectAxis('left', 0.5);
  c.poll();
  assert.equal(c.isActive('left'), true);
  assert.equal(c.getValue('left'), 0.5);
  c.poll();
  assert.equal(c.isActive('left'), false, 'analog injection is transient per poll');

  c.tap('fire');
  c.poll();
  assert.equal(c.isPressed('fire'), true);
  c.endFrame();
  c.poll();
  assert.equal(c.isReleased('fire'), true, 'tap auto-releases after one tick');

  assert.throws(() => c.inject('nope', true));
  assert.throws(() => c.injectAxis('nope', 1));
  assert.throws(() => c.tap('nope'));
});

test('injectAxis clamps NaN and out-of-range values', () => {
  const c = createController({ bindings: BINDINGS });
  c.injectAxis('left', Number.NaN);
  c.injectAxis('left', -3);
  c.poll();
  assert.equal(c.isActive('left'), false);
  c.injectAxis('left', 42);
  c.poll();
  assert.equal(c.getValue('left'), 1, 'clamped to 1');
});

test('getAction returns copies; unknown action returns neutral state', () => {
  const c = createController({ bindings: BINDINGS });
  const snap = c.getAction('jump');
  snap.active = true;
  assert.equal(c.isActive('jump'), false, 'mutating the copy does not leak');
  assert.deepEqual(c.getAction('missing'), { active: false, pressed: false, released: false, value: 0 });
});

test('reset clears held state; detach removes listeners', () => {
  const src = new FakeEventSource();
  const c = createController({ bindings: BINDINGS, keyboardSource: src });
  c.attach();
  src.emit('keydown', { code: 'Space' });
  c.poll();
  assert.equal(c.isActive('jump'), true);
  c.reset();
  c.poll();
  assert.equal(c.isActive('jump'), false);
  c.detach();
  assert.equal(src.listenerCount(), 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`${TEST_LOG_PREFIX} ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`${TEST_LOG_PREFIX} FAIL - ${name}`, err);
  }
}
if (failed > 0) {
  console.error(`${TEST_LOG_PREFIX} ${failed}/${tests.length} tests FAILED`);
  process.exit(1);
}
console.log(`${TEST_LOG_PREFIX} all ${tests.length} tests passed`);
