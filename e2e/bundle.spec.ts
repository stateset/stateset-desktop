import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listPackage } from '@electron/asar';
import type { Page } from '@playwright/test';
import { test, expect, requireDesktopDisplay } from './desktop';
import { createWorkflowEngineFixture } from './workflow-engine-fixture';
import metadata from '../package.json';

test.beforeAll(() => requireDesktopDisplay());

test('Linux bundle opens its production renderer and retains encrypted settings after restart', async ({
  desktop,
}) => {
  test.skip(process.platform !== 'linux', 'Linux bundle verification');
  const executable = process.env.STATESET_PACKAGED_EXECUTABLE;
  if (!executable)
    throw new Error('Set STATESET_PACKAGED_EXECUTABLE to the built Linux application.');
  const profile = await desktop.createBundleProfile();
  let application = await desktop.launchBundle(executable, profile);
  let page = application.page;
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.app.isE2ETest)).toBe(false);
  expect(await page.evaluate(() => window.electronAPI!.app.getVersion())).toBe(metadata.version);
  await page.evaluate(() => window.electronAPI!.store.set('theme', 'light'));
  const directories = await readdir(profile.configHome);
  const profiles = [];
  for (const directory of directories) {
    const location = path.join(profile.configHome, directory);
    if (
      await stat(path.join(location, '.store-key'))
        .then(() => true)
        .catch(() => false)
    )
      profiles.push(location);
  }
  expect(profiles).toHaveLength(1);
  const userData = profiles[0];
  const keyPath = path.join(userData, '.store-key');
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const originalKey = digest(await readFile(keyPath));
  expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  expect(
    (await readFile(path.join(userData, 'stateset-config.json'))).includes(Buffer.from('"theme"'))
  ).toBe(false);
  const archive = path.join(path.dirname(path.resolve(executable)), 'resources', 'app.asar');
  const files = listPackage(archive, { isPack: false });
  expect(files.some((file) => file.endsWith('/dist/electron/main.js'))).toBe(true);
  expect(files.some((file) => file.endsWith('/dist/renderer/index.html'))).toBe(true);
  expect(
    files.filter(
      (file) => file.includes('/dist/verification/') || /\/dist\/electron\/.*\.test\.js$/.test(file)
    )
  ).toEqual([]);
  await application.close();

  application = await desktop.launchBundle(executable, profile);
  page = application.page;
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('light');
  expect(digest(await readFile(keyPath))).toBe(originalKey);
  await mkdir('dist/verification', { recursive: true });
  await page.screenshot({
    path: 'dist/verification/linux-bundle-startup.png',
    animations: 'disabled',
  });
  await application.close();
});

test('Linux bundle uses its saved HTTPS engine through native transport while renderer CSP stays enforced', async ({
  desktop,
}) => {
  test.skip(process.platform !== 'linux', 'Linux bundle verification');
  const executable = process.env.STATESET_PACKAGED_EXECUTABLE;
  if (!executable)
    throw new Error('Set STATESET_PACKAGED_EXECUTABLE to the built Linux application.');
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const brandId = '22222222-2222-4222-8222-222222222222';
  const requestId = '33333333-3333-4333-8333-333333333333';
  const workflowId = `active-horizon-agent-${brandId.replace(/-/g, '')}-${requestId.replace(/-/g, '')}`;
  const fixtureKey = 'owned-packaged-workflow-fixture-key';
  const closedStreams: number[] = [];
  let streamCount = 0;
  let startBodyMatches = false;
  const fixture = await createWorkflowEngineFixture({
    https: true,
    apiKey: fixtureKey,
    tenantId,
    lastEventId: 1,
    handler: async (request, response, observed) => {
      const reply = (body: unknown, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (!observed.authorizationMatches || !observed.tenantMatches) {
        reply({ message: 'Fixture header mismatch' }, 401);
        return;
      }
      if (observed.method === 'GET' && observed.path === '/health') {
        reply({ status: 'healthy' });
        return;
      }
      if (
        observed.method === 'POST' &&
        observed.path === '/v1/workflows/active-horizon-agent/start'
      ) {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (Buffer.byteLength(raw, 'utf8') > 64_000)
            throw new Error('Fixture body exceeded its bound');
        }
        const body = JSON.parse(raw);
        startBodyMatches =
          body.brand_id === brandId &&
          body.request_id === requestId &&
          body.goal === 'Verify packaged native transport' &&
          body.tasks?.length === 1 &&
          body.tasks[0].workflow_type === 'SandboxAgentLoopWorkflow';
        reply({ workflow_id: workflowId, run_id: 'owned-fixture-run' });
        return;
      }
      if (
        observed.method === 'GET' &&
        observed.path === `/v1/workflows/active-horizon-agent/${workflowId}/status`
      ) {
        reply({ status: 'running', goal: 'Verify packaged native transport', turns_completed: 0 });
        return;
      }
      if (
        observed.method === 'POST' &&
        observed.path === `/v1/workflows/active-horizon-agent/${workflowId}/cancel`
      ) {
        reply({ accepted: true });
        return;
      }
      if (observed.method === 'GET' && observed.path === `/v1/workflows/${workflowId}/events`) {
        const index = ++streamCount;
        if (
          (index === 1 && !observed.lastEventIdAbsent) ||
          (index === 2 && !observed.lastEventIdMatches) ||
          index > 2
        ) {
          reply({ message: 'Unexpected stream resume header' }, 400);
          return;
        }
        response.once('close', () => closedStreams.push(index));
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });
        const frame = Buffer.from(
          `id: ${index}\r\ndata: ${JSON.stringify({
            event_id: index,
            kind: 'fixture_event',
            ts: '2026-10-17T00:00:00.000Z',
            preview: '界',
          })}\r\n\r\n`
        );
        // Exercise a UTF-8 code point split across actual socket writes.
        const boundary = frame.indexOf(Buffer.from('界')) + 1;
        response.write(frame.subarray(0, boundary));
        setImmediate(() => {
          if (response.destroyed) return;
          response.write(frame.subarray(boundary));
          if (index === 2) response.end();
        });
        return;
      }
      reply({ message: 'No other fixture operation is allowed' }, 404);
    },
  });
  let application: Awaited<ReturnType<typeof desktop.launchBundle>> | undefined;
  const seed = (page: Page) =>
    page.evaluate(
      async ({ url, key }) => {
        const api = window.electronAPI!;
        if (!api?.computerChat || !api.durableWorkflows)
          throw new Error('The packaged native workflow bridge is unavailable.');
        const savedUrl = await api.store.set('durableWorkflowEngineUrl', url);
        const savedKey = await api.auth.setDurableEngineApiKey(key);
        return {
          savedUrl: savedUrl && (await api.store.get('durableWorkflowEngineUrl')) === url,
          savedKey: savedKey && (await api.auth.getDurableEngineApiKey()) === key,
        };
      },
      { url: fixture.url, key: fixtureKey }
    );
  const send = (page: Page, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) =>
    page.evaluate(
      async ({ tenantId, path, method, body }) => {
        const connection = await window.electronAPI!.computerChat!.getConnection();
        return window.electronAPI!.durableWorkflows!.request({
          ...connection,
          id: crypto.randomUUID(),
          tenantId,
          path,
          method,
          ...(body === undefined ? {} : { body }),
        });
      },
      { tenantId, path, method, body }
    );
  try {
    // A fresh CA cannot already be trusted by the unmodified app process.
    application = await desktop.launchBundle(executable, await desktop.createBundleProfile());
    await expect(application.page.getByText('Welcome back')).toBeVisible();
    expect(await seed(application.page)).toEqual({ savedUrl: true, savedKey: true });
    const withoutCa = await application.page.evaluate(async (tenantId) => {
      try {
        const connection = await window.electronAPI!.computerChat!.getConnection();
        await window.electronAPI!.durableWorkflows!.request({
          ...connection,
          id: crypto.randomUUID(),
          tenantId,
          path: '/health',
          method: 'GET',
        });
        return { rejected: false, tlsFailure: false };
      } catch (error) {
        return {
          rejected: true,
          tlsFailure: /fetch failed|certificate|tls|ssl/i.test(String(error)),
        };
      }
    }, tenantId);
    expect(withoutCa).toEqual({ rejected: true, tlsFailure: true });
    await expect.poll(() => fixture.tlsFailures).toBeGreaterThan(0);
    expect(fixture.requests).toEqual([]);
    const untrustedTlsFailures = fixture.tlsFailures;
    const untrustedHttpRequests = fixture.requests.length;
    await application.close();
    application = undefined;

    if (!fixture.caPath) throw new Error('HTTPS fixture did not provide its public CA');
    application = await desktop.launchBundle(executable, await desktop.createBundleProfile(), {
      extraCACertPath: fixture.caPath,
    });
    const page = application.page;
    await page.waitForURL(/^file:\/\//);
    await expect(page.getByText('Welcome back')).toBeVisible();
    expect(await page.evaluate(() => window.electronAPI!.app.isE2ETest)).toBe(false);
    expect(await page.evaluate(() => window.electronAPI!.app.getVersion())).toBe(metadata.version);
    expect(await seed(page)).toEqual({ savedUrl: true, savedKey: true });
    const rendererControl = await page.evaluate(async (url) => {
      let enforcedConnectSrc = false;
      const observe = (event: SecurityPolicyViolationEvent) => {
        if (
          event.effectiveDirective === 'connect-src' &&
          event.disposition === 'enforce' &&
          event.blockedURI.startsWith(url)
        )
          enforcedConnectSrc = true;
      };
      document.addEventListener('securitypolicyviolation', observe);
      let rejected = false;
      try {
        await fetch(`${url}/health`);
      } catch {
        rejected = true;
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      document.removeEventListener('securitypolicyviolation', observe);
      return { rejected, enforcedConnectSrc };
    }, fixture.url);
    expect(rendererControl).toEqual({ rejected: true, enforcedConnectSrc: true });
    expect(fixture.requests).toEqual([]);
    expect(await send(page, '/health')).toMatchObject({
      ok: true,
      status: 200,
      body: { status: 'healthy' },
    });
    expect(
      await send(page, '/v1/workflows/active-horizon-agent/start', 'POST', {
        brand_id: brandId,
        request_id: requestId,
        goal: 'Verify packaged native transport',
        tasks: [
          {
            task_id: 'desktop-step-1',
            description: 'Fixture transport check',
            workflow_type: 'SandboxAgentLoopWorkflow',
            payload: {
              session: {
                name: 'owned-bundle-fixture',
                cpus: '1',
                memory: '1Gi',
                isolation: 'gvisor',
                sandbox_timeout_seconds: 30,
                budget: { iteration_limit: 3, duration_limit_seconds: 30 },
                rotation: {},
                client_id: 'owned-bundle-fixture',
              },
              commands: [['sh', '-lc', 'printf fixture']],
              per_exec_timeout_ms: 30_000,
            },
          },
        ],
        allowed_workflow_types: ['SandboxAgentLoopWorkflow'],
        active_window_secs: 300,
        max_turns: 1,
        max_failures: 1,
        turn_timeout_secs: 30,
        checkpoint_every_turns: 1,
      })
    ).toMatchObject({
      ok: true,
      status: 200,
      body: { workflow_id: workflowId, run_id: 'owned-fixture-run' },
    });
    expect(startBodyMatches).toBe(true);
    expect(
      await send(page, `/v1/workflows/active-horizon-agent/${workflowId}/status`)
    ).toMatchObject({ ok: true, status: 200, body: { status: 'running' } });
    expect(
      await send(page, `/v1/workflows/active-horizon-agent/${workflowId}/cancel`, 'POST')
    ).toMatchObject({ ok: true, status: 200, body: { accepted: true } });

    const openStream = (lastEventId: number) =>
      page.evaluate(
        async ({ tenantId, workflowId, lastEventId }) => {
          const owner = window as Window & {
            __ownedWorkflowStreams?: Record<
              string,
              { events: { id: number; decoded: boolean }[]; settled: boolean; rejected: boolean }
            >;
          };
          owner.__ownedWorkflowStreams ??= {};
          const id = crypto.randomUUID();
          const state = {
            events: [] as { id: number; decoded: boolean }[],
            settled: false,
            rejected: false,
          };
          owner.__ownedWorkflowStreams[id] = state;
          const connection = await window.electronAPI!.computerChat!.getConnection();
          void window
            .electronAPI!.durableWorkflows!.stream(
              {
                ...connection,
                id,
                tenantId,
                workflowId,
                lastEventId,
              },
              (event) => state.events.push({ id: event.event_id, decoded: event.preview === '界' })
            )
            .then(
              () => {
                state.settled = true;
              },
              () => {
                state.rejected = true;
                state.settled = true;
              }
            );
          return id;
        },
        { tenantId, workflowId, lastEventId }
      );
    const streamState = (id: string) =>
      page.evaluate((id) => {
        const streams = (
          window as Window & {
            __ownedWorkflowStreams?: Record<
              string,
              {
                events: { id: number; decoded: boolean }[];
                settled: boolean;
                rejected: boolean;
              }
            >;
          }
        ).__ownedWorkflowStreams;
        if (!streams?.[id]) throw new Error('The owned workflow stream was not registered');
        return streams[id];
      }, id);
    const initialStream = await openStream(0);
    await expect
      .poll(async () => (await streamState(initialStream)).events)
      .toEqual([{ id: 1, decoded: true }]);
    expect(
      await page.evaluate((id) => window.electronAPI!.durableWorkflows!.cancel(id), initialStream)
    ).toBe(true);
    await expect.poll(() => closedStreams.includes(1)).toBe(true);
    await expect
      .poll(() => streamState(initialStream))
      .toEqual({
        events: [{ id: 1, decoded: true }],
        settled: true,
        rejected: true,
      });
    const resumedStream = await openStream(1);
    await expect
      .poll(() => streamState(resumedStream))
      .toEqual({
        events: [{ id: 2, decoded: true }],
        settled: true,
        rejected: false,
      });

    const originalConnection = await page.evaluate(() =>
      window.electronAPI!.computerChat!.getConnection()
    );
    const changedKeyStored = await page.evaluate(async () => {
      const key = 'rotated-owned-packaged-fixture-key';
      return (
        (await window.electronAPI!.auth.setDurableEngineApiKey(key)) &&
        (await window.electronAPI!.auth.getDurableEngineApiKey()) === key
      );
    });
    expect(changedKeyStored).toBe(true);
    const changedRevision = await page.evaluate(
      async (revision) =>
        (await window.electronAPI!.computerChat!.getConnection()).revision !== revision,
      originalConnection.revision
    );
    expect(changedRevision).toBe(true);
    const beforeStaleRequest = fixture.requests.length;
    const staleRejected = await page.evaluate(
      async ({ connection, tenantId }) => {
        try {
          const response = await window.electronAPI!.durableWorkflows!.request({
            ...connection,
            id: crypto.randomUUID(),
            tenantId,
            method: 'GET',
            path: '/health',
          });
          return !response.ok && response.status === 409;
        } catch (error) {
          return /connection changed|reconnect.*connection/i.test(String(error));
        }
      },
      { connection: originalConnection, tenantId }
    );
    expect(staleRejected).toBe(true);
    expect(fixture.requests).toHaveLength(beforeStaleRequest);
    const expectedPaths = [
      ['GET', '/health'],
      ['POST', '/v1/workflows/active-horizon-agent/start'],
      ['GET', `/v1/workflows/active-horizon-agent/${workflowId}/status`],
      ['POST', `/v1/workflows/active-horizon-agent/${workflowId}/cancel`],
      ['GET', `/v1/workflows/${workflowId}/events`],
      ['GET', `/v1/workflows/${workflowId}/events`],
    ];
    expect(fixture.requests.map(({ method, path }) => [method, path])).toEqual(expectedPaths);
    expect(
      fixture.requests.every((request) => request.authorizationMatches && request.tenantMatches)
    ).toBe(true);
    expect(fixture.requests[4].lastEventIdAbsent).toBe(true);
    expect(fixture.requests[5].lastEventIdMatches).toBe(true);
    expect(fixture.requests.slice(4).every((request) => request.acceptsEventStream)).toBe(true);
    expect(fixture.handlerErrors).toBe(0);
    const receipt = {
      schemaVersion: 1,
      productionRenderer: true,
      e2eMode: false,
      scopedCertificateAuthority: true,
      withoutCa,
      untrustedTlsFailures,
      untrustedHttpRequests,
      rendererControl,
      rendererControlHttpRequests: 0,
      requests: fixture.requests,
      startBodyMatches,
      initialStream: await streamState(initialStream),
      resumedStream: await streamState(resumedStream),
      cancelledStreamClosed: closedStreams.includes(1),
      changedKeyStored,
      changedRevision,
      staleRevisionRejected: staleRejected,
      staleRevisionHttpRequests: fixture.requests.length - beforeStaleRequest,
      ambientRootProbeCount: fixture.ambientRootProbeCount,
      qualification:
        'Real Linux executable, production renderer/CSP and public preload bridge; owned HTTPS responses simulate workflow execution. No live Temporal, sandbox, policy execution or OS-keyring persistence is claimed.',
    };
    const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
    await mkdir('dist/verification', { recursive: true });
    await writeFile('dist/verification/custom-engine-native-transport.json', bytes);
    await test
      .info()
      .attach('custom-engine-native-transport', { body: bytes, contentType: 'application/json' });
  } finally {
    try {
      await application?.close();
    } finally {
      await fixture.close();
    }
  }
});
