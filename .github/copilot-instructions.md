# PSX Procedural Terrain - AI Agent Instructions

## Project Overview
A Three.js-based 3D character controller demo with third-person camera, featuring a rigged character with state-based animations (idle/walk/run). The project uses vanilla JavaScript with ES6 modules loaded directly from CDN (no build step), now refactored into a modular structure.

## Architecture

### Core Components (modular structure in `/js/`)
- **CharacterController.js**: Character physics, movement, FBX loading, and animation coordination
  - `BasicCharacterController`: Main controller with velocity-based physics
  - `BasicCharacterControllerInput`: WASD + Shift keyboard input handler
  - `BasicCharacterControllerProxy`: Animation proxy for state machine
- **StateMachine.js**: Animation state management system
  - `FiniteStateMachine`: Base FSM implementation
  - `CharacterFSM`: Character-specific state machine (idle/walk/run)
  - `State`, `IdleState`, `WalkState`, `RunState`: Animation state implementations
- **Camera.js**: Third-person camera with smooth lerp-based following
  - `ThirdPersonCamera`: Camera controller with configurable follow distance/height
- **Terrain.js**: Ground/floor management (designed for procedural generation)
  - `Terrain`: Currently a simple plane, extensible for maze/procedural terrain
  - Methods: `getHeightAt()`, `Update()`, `getMesh()`
- **main.js**: Application entry point and scene orchestration
  - `ThirdPersonCameraDemo`: Renderer, scene setup, lighting, skybox, animation loop

### Data Flow
1. User input → `BasicCharacterControllerInput` captures keydown/keyup
2. Controller reads input → updates velocity/rotation → applies to character position
3. State machine monitors input → triggers animation crossfades via Three.js AnimationMixer
4. Camera tracks character position → smoothly interpolates to ideal offset/lookat
5. Main RAF loop calls `_Step()` → updates controller → terrain → camera → renders

## Key Patterns & Conventions

### Material Configuration (CharacterController.js lines ~47-68)
Character FBX loader removes internal lights and converts all materials to matte (non-reflective) Phong:
```javascript
m.shininess = 0;
m.specular.set(0x000000);
m.reflectivity = 0;
```
**Why**: Achieves PSX-style low-poly aesthetic without glossy highlights

### Animation State Transitions (StateMachine.js)
States use `crossFadeFrom()` with 0.5s duration and time-ratio preservation when switching between walk/run:
```javascript
const ratio = curAction.getClip().duration / prevAction.getClip().duration;
curAction.time = prevAction.time * ratio;
```
**Critical**: This prevents animation "snapping" - maintains visual continuity during speed changes

### Camera Smoothing (Camera.js)
Uses exponential decay lerp formula instead of linear interpolation:
```javascript
const t = 1.0 - Math.pow(0.001, timeElapsed);
this._currentPosition.lerp(idealOffset, t);
```
**Why**: Frame-rate independent smoothing (see test functions at bottom of main.js for proof)

### Character Control (CharacterController.js)
- Acceleration is applied to velocity, not position directly
- Rotation is quaternion-based using axis-angle
- Forward/backward move in character's local Z-axis
- Shift key multiplies acceleration by 4.0 for sprinting

### Terrain Extensibility (Terrain.js)
Designed for easy replacement with procedural generation:
- `_Init()`: Override to generate mazes, heightmaps, etc.
- `getHeightAt(x, z)`: Returns height at position (for collision/placement)
- `Update(timeElapsed)`: For dynamic/animated terrain
- Currently returns a simple plane mesh at Y=0

## Development Workflow

### Running the Project
1. Serve files via local web server: `python -m http.server 8000` or `npx http-server`
2. Open `http://localhost:8000/index.html` in browser
3. **No build step required** - uses ES6 modules from CDN

### Testing Changes
- Modify files in `/js/` and refresh browser
- Check browser console for Three.js warnings or module loading errors
- Character animation issues often stem from state machine logic (StateMachine.js)
- Terrain changes go in `Terrain.js` `_Init()` method

### Adding Procedural Terrain/Mazes
1. Edit `js/Terrain.js` `_Init()` method
2. Replace plane geometry with your generation algorithm
3. Update `getHeightAt()` to return correct heights for collision
4. Ensure materials have `receiveShadow = true` for proper lighting

### Resource Dependencies
- Three.js r118 loaded from `cdn.jsdelivr.net` (CDN)
- FBX models in `resources/character/`: `character_rigged.fbx`, `idle.fbx`, `walk.fbx`, `run.fbx`
- Skybox cubemap textures in `resources/sky/`: 6 PNG files (vz_sinister_*.png)

## Common Gotchas

1. **Module Imports**: All imports use ES6 syntax with CDN URLs or relative paths starting with `./`
2. **FBX Loading**: FBXLoader path is set with `setPath()` before `load()` - don't include path in filename
3. **Animation Mixer**: Must call `this._mixer.update(timeElapsedS)` every frame or animations freeze
4. **State Machine**: Requires `_manager.onLoad` callback to set initial 'idle' state - character won't animate without this
5. **Camera Follow**: Distance/height tweaked via `_followDistance`, `_followHeight`, `_aimHeight` in Camera.js
6. **Shadows**: Character mesh traversal sets `castShadow = true`, terrain has `receiveShadow = true`
7. **Terrain Changes**: Always update both mesh geometry AND collision methods (`getHeightAt()`)

## Integration Points

- **Three.js**: Directly imported from CDN, no local build. Changing versions requires updating all import URLs across `/js/` files
- **Asset Loading**: Uses Three.js loaders (FBXLoader, CubeTextureLoader) with async callbacks - ensure resources path is correct relative to `index.html`
- **Input System**: Pure DOM events via keyCodes (87=W, 65=A, 83=S, 68=D, 16=Shift), no input library - easily extensible for gamepad/touch
- **Module System**: ES6 modules with explicit exports/imports - add new modules to `/js/` and import in main.js or other modules as needed

## File Structure
```
index.html          # Minimal HTML shell, imports js/main.js as ES6 module
base.css            # Fullscreen canvas styling
js/
  main.js           # Application entry point, scene orchestration (~165 lines)
  CharacterController.js  # Character physics, input, FBX loading (~255 lines)
  StateMachine.js   # Animation FSM (idle/walk/run states) (~200 lines)
  Camera.js         # Third-person camera with smooth following (~47 lines)
  Terrain.js        # Ground/terrain generation (extensible for mazes) (~65 lines)
resources/
  character/        # 4 FBX files (rigged model + 3 animations)
  sky/              # 6 cubemap PNG textures
```
