// These ports are already trusted by the desktop's development navigation policy.
const port = process.env.STATESET_DESKTOP_TEST_PORT ?? '5173';
if (port !== '5173' && port !== '3000') {
  throw new Error('STATESET_DESKTOP_TEST_PORT must be 5173 or 3000.');
}

export const DESKTOP_TEST_PORT = Number(port);
export const DESKTOP_TEST_ORIGIN = `http://localhost:${port}`;
