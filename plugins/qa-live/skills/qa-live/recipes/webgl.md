# Recipe — WebGL / canvas / 3D

Load when recon finds a `<canvas>` driven by Three.js, Babylon, PixiJS, regl, or raw WebGL.

## Never do this

**Do not read pixels back to check that something rendered.** Without
`preserveDrawingBuffer: true` the buffer is cleared after compositing, so
`drawImage(canvas)` returns pure black on a perfectly working scene. This produces a
confident, completely wrong "nothing renders" finding. Take a screenshot and look at it.

## Checks

**Context health** — `qa.webgl()` gives the version, whether the context is lost, and the
CSS size against the backing buffer. A `ratio` of 1 on a retina screen means the scene is
rendering at half resolution; a ratio above 2 wastes GPU for no visible gain (most
renderers cap at 2 deliberately — `Math.min(devicePixelRatio, 2)`).

**Context loss recovery** — the check developers most often skip, and the one that
produces a permanently black canvas in the wild. Browsers drop the GPU context on
backgrounded tabs, sleep, or memory pressure. Force it and see whether the app comes back:

```js
// via run-code
const ext = gl.getExtension('WEBGL_lose_context');
ext.loseContext();            // canvas goes black
setTimeout(() => ext.restoreContext(), 1000);
```

Then screenshot. A robust app listens for `webglcontextlost` (calling `preventDefault()`)
and `webglcontextrestored`, and rebuilds. If nothing is listening, say so — the fix is
two event listeners.

**Resize** — resize the viewport and re-run `qa.webgl()`. The CSS size must follow the
viewport and the buffer must be rebuilt. A canvas that keeps its old buffer looks
stretched or cropped. Test portrait too: phone rotation is the common trigger.

**`prefers-reduced-motion`** — CSS handling is easy and usually present; the render loop
is what gets forgotten. Emulate it, reload, then take two lossless PNG captures ~2s apart
at a fixed scroll position and compare their bytes. Identical means the scene is properly
frozen; different means continuous animation persists. **Always run the same comparison
without the preference as a control**, otherwise the test proves nothing.

```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
```

**Weight** — 3D projects are where page weight goes wrong. Check whether models declare
compression: `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`.
A raw `strings model.glb | grep -E 'draco|meshopt|basisu'` returning nothing means
uncompressed geometry and textures. Report the transfer time on a realistic connection,
not on localhost — local loading hides the entire problem (a 40 MB model loads in 340 ms
locally and takes ~30 s on 10 Mb/s 4G).

Models inlined as base64 in JS deserve a note: the encoding adds ~33%, and the asset can
no longer be cached or streamed separately from the code.

**Scroll-driven scenes** — sample the state across the scroll range rather than eyeballing
it. `qa.at(f, {…})` scrolls to a fraction and reads elements in one call. Walk 0, 0.25,
0.5, 0.75, 1 and check the progression is monotonic where it should be and that nothing
snaps back.

**Text over the scene** — a canvas backdrop makes contrast unmeasurable from CSS, and
`qa.contrast` will say so. Either the design protects the text (an opaque or heavily
blurred panel — measure that panel's own background) or it does not, in which case
contrast varies with whatever the camera is pointing at. That is a real finding: sample
the rendered colour behind the text from a screenshot at the worst-case scroll position.

## Worth praising when present

Pixel ratio capped at 2 · context loss handled · `powerPreference` set deliberately ·
the renderer disposed on teardown · a loader removed from the DOM rather than left at
`opacity: 0` over the content.
