import { access } from 'node:fs/promises';
import type { ElectronApplication } from '@playwright/test';
import { test, expect, requireDesktopDisplay } from './desktop';

// These cases exercise the real test-fixture lifecycle across two tests. A suite
// window must survive; a test's process and temporary profile must not.
test.describe.serial('Owned native test resources', () => {
  let shared: ElectronApplication;
  let ownedPid: number;
  let ownedProfile: string;
  test.beforeAll(async ({ desktop }) => {
    requireDesktopDisplay();
    shared = await desktop.launch();
  });
  test.afterAll(async () => {
    await shared?.close();
  });
  test('records a test-owned app alongside the suite-owned app', async ({ desktop }) => {
    const profile = await desktop.createProfile();
    ownedProfile = profile.userData;
    const application = await desktop.launch(profile);
    ownedPid = application.process().pid!;
    expect(ownedPid).not.toBe(shared.process().pid);
    await expect(application.firstWindow()).resolves.toBeDefined();
    await expect(access(ownedProfile)).resolves.toBeUndefined();
  });
  test('closes the previous test app and removes only its temporary profile', async () => {
    expect(() => process.kill(ownedPid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    await expect(access(ownedProfile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await shared.evaluate(() => true)).toBe(true);
    expect(shared.process().exitCode).toBeNull();
  });
});
