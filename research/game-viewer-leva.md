# Running Generated Games In-App: GameViewer (iframe isolation) + Leva Inspector

> User-provided architecture ruling, 2026-06-06. Authoritative for how finalized games are
> embedded, windowed, and inspected inside the creator app. Complements `vite.md`
> (game build), `pixijs.md` (one Pixi Application per game), `rxdb.md` (per-game DB).

## 1. Running games in-app, windowing, and executables

Each finalized game is a self-contained Vite build — its own React tree, its own RxDB,
its own Pixi `Application`, its own bitECS world. **Do NOT mount that directly into the
creator app's React tree.** Three things break:

1. **WebGL contexts** — browsers cap live contexts (~16 per page); each Pixi game holds
   one. Mount a few games inline and you leak/exhaust contexts.
2. **RxDB/IndexedDB collisions** — multiple instances colliding in one realm.
3. **Teardown** — RAF loops, Pixi contexts, and DB connections that don't clean up on
   React unmount.

**Ruling: hard boundary via `<iframe>`** pointing at the game's built URL. Separate JS
realm, separate WebGL context, isolated DOM/CSS, clean lifecycle — destroying the iframe
destroys the whole game (context, loop, DB connection). "Cue a window of the game" =
GameViewer renders an iframe; mounting starts the game, unmounting kills it.

```tsx
function GameViewer({ gameId }: { gameId: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { /* game → host events */ };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  // postMessage to send a definition in, listen for events back
  return <iframe ref={ref} src={`/play/${gameId}`} title="game"
                 sandbox="allow-scripts allow-same-origin" />;
}
```

- True separate OS window: `window.open('/play/' + gameId)`.
- Host ↔ game communication is **postMessage** both directions (definition in,
  gameplay/telemetry events out).

## 2. Leva inspector — lives INSIDE the game runtime, not the host

Because the game runs in its own realm, a host-side Leva panel can't see game state
without round-tripping everything over postMessage. **Ruling: Leva ships inside the game
runtime template**, with direct access to the game's RxDB store and bitECS world, gated
by a dev/inspect flag. The host just shows the framed game. (A host-side panel is
possible only by bridging state via postMessage and driving Leva's function-form setter.)

### Leva API (three pieces)

**`useControls(schema)`** — core hook; returns live values; types inferred from value or
specified `{ value, min, max, step }`. This is the **tweak path** (values flow into the game):

```tsx
const { speed, gravity, showColliders } = useControls({
  speed: { value: 1, min: 0, max: 10, step: 0.1 },
  gravity: 9.8,
  showColliders: false,
});
```

Function form returns `[values, set]` — the **inspect path**; push live game state into
the panel each frame or on each RxDB change:

```tsx
const [, set] = useControls(() => ({ fps: 0, entities: 0, playerHP: 100 }));
// in the loop or a subscription:
set({ fps, entities: world.entityCount, playerHP: player.hp });
```

**Helpers** — `folder({...})` groups, `button(() => fn())` fires actions,
`monitor(fn, { graph: true })` plots a live value:

```tsx
import { useControls, folder, button, monitor } from 'leva';
useControls({
  sim: folder({ speed, gravity }),
  debug: folder({ showColliders, fps: monitor(getFps, { graph: true }) }),
  controls: folder({
    pause: button(() => togglePause()),
    step:  button(() => stepOneFrame()),
    reset: button(() => resetWorld()),
  }),
});
```

**`<Leva />`** — the panel container, placed once. `fill` docks it into a parent element
(embed in a viewer sidebar instead of floating top-right); `collapsed`, `hidden`,
`titleBar`, `oneLineLabels`, `theme` tune the rest:

```tsx
<Leva fill collapsed hidden={!inspectMode} />
```

### Structure summary

`useControls` (object form = knobs you read; function form `[v, set]` = state you push
in) + `folder`/`button`/`monitor` for organization, actions, live readouts + one
`<Leva />` for placement/appearance. Gate everything behind an `inspectMode` flag so it
is stripped from the player-facing build — same as stripping RxDB's dev-mode plugin in
production.

## Implementation implications

- `engine/compiler/vite-creator.ts`: each game build must serve at a stable URL
  (`/play/<gameId>`) and include the runtime inspector template (Leva, flag-gated).
- New host surface needed: `GameViewer` component (engine/frontend/components/) +
  `/play/[gameId]` route; postMessage protocol (typed, Zod-schemaed) for definition-in /
  telemetry-out.
- `leva` is a **dependency of the generated game's package.json** (game runtime), gated
  out of production builds; whether it also lands in the engine root package.json is a
  user decision (root currently does not include it).
