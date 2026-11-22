# Faultline

A 2D precision platformer by [Mohammad Olleik](https://github.com/mhmdolleik-fullstack), built with TypeScript, Phaser 3 and Vite for desktop browsers and landscape touch screens.

Mara follows the emergency lights into a collapsed industrial complex. Falling dust gives her a moment to dodge a ceiling slab. Farther underground, sparks warn her that lava is about to rise between two platforms. The goal is to read those signals, time the jump and reach the lit bulkhead. A shield buys three seconds of protection when the timing goes wrong.

## Play locally

With Node.js 22 and npm installed, run the following commands.

```sh
git clone https://github.com/mhmdolleik-fullstack/game.git
cd game
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:3000). On a touch screen, rotate to landscape for the on-screen controls.

| Move | Jump | Shoot | Shield | Dash | Nova | Pause |
| --- | --- | --- | --- | --- | --- | --- |
| A / D | Space | F | Shift | X | C | Esc |

## The first descent

Each episode spans 120 generated levels. The world changes every 20 levels, and later episodes revisit the six worlds with new layouts.

| Levels | World | What to watch for |
| --- | --- | --- |
| 1–20 | Intake Ruins | Dust falls just before a ceiling slab drops. |
| 21–40 | Hydraulic Foundry | Cloud rings mark an updraft that carries Mara across a gap. |
| 41–60 | Ghost Relay | Amber buds open before thorn vines spread. |
| 61–80 | Cryogen Vault | A moving searchlight narrows the window to cross. |
| 81–100 | Counterweight Docks | Sparks mark a lava basin. Cross as the surface recedes. |
| 101–120 | The Seismic Heart | Frost gathers overhead before the icicles fall. |

## Inside the game

- **Repeatable routes.** The level and segment numbers seed the layout generator. Returning to the same stage recreates its platforms, hazards and checkpoints. [Level generator](src/systems/LevelGenerator.ts)
- **Readable hazards.** Each world's signature encounter uses a shared timing cycle for its warning, animation and collision area. [World encounters](src/systems/WorldEncounter.ts)
- **Combat and recovery.** Shooting and dashing give the player ways through an encounter. A timed shield offers a brief opening, and checkpoint saves let the player resume a run. [Gameplay scene](src/scenes/GameScene.ts) · [Shield](src/systems/Shield.ts) · [Save system](src/systems/Save.ts)
- **Offline Android build.** The Android wrapper packages the compiled web game as local WebView assets. [Android build script](mobile/android/build.ps1)

## Build and verify

```sh
npm run build
npm run preview
npm test
```

The production build type-checks the Phaser source and writes the browser game to `build/`. The Node test suite exercises the earlier Canvas implementation in `dist/`, checking 10,000 generated routes, checkpoint persistence, shield timing and combat interactions.
