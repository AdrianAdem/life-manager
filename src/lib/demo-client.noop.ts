// Stand-in for demo-client in normal builds. Vite aliases `./demo-client` to
// this file unless VITE_DEMO=1, so the fixture data never reaches the
// production bundle.

export const demoClient = null;
export const IS_DEMO = false;
export const demoFoodResponse = (): null => null;
