// The browser the video tools render with. Playwright from tools/video/node_modules (npm i --no-save playwright), any
// node_modules above, or a global install. On Linux without a GPU: Mesa's llvmpipe through ANGLE, several times faster
// than SwiftShader. On a Mac: ANGLE on Metal, the GPU. Overrides: MS_GL_ARGS="…" (the GL flags), MS_CHANNEL=chrome (an
// installed Google Chrome instead of Playwright's Chromium), MS_HEADED=1 (a visible window).
function playwright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) { try { return require(p); } catch (e) {} }
  throw new Error('Playwright not found: in tools/video run npm i --no-save playwright (and npx playwright install chromium, unless MS_CHANNEL=chrome)');
}
const GL = process.env.MS_GL_ARGS ? process.env.MS_GL_ARGS.split(/\s+/).filter(Boolean)
  : process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'];
exports.launch = (extra = []) => playwright().chromium.launch({ args: [...GL, ...extra], headless: !process.env.MS_HEADED, ...(process.env.MS_CHANNEL ? { channel: process.env.MS_CHANNEL } : {}) });
