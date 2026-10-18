import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export interface WorkflowEngineFixtureRequest {
  method: string;
  path: string;
  authorizationMatches: boolean;
  tenantMatches: boolean;
  lastEventIdAbsent: boolean;
  lastEventIdMatches: boolean;
  acceptsEventStream: boolean;
}

export interface WorkflowEngineFixtureOptions {
  https?: boolean;
  apiKey?: string;
  tenantId?: string;
  lastEventId?: number;
  handler?: (
    request: IncomingMessage,
    response: ServerResponse,
    observed: WorkflowEngineFixtureRequest
  ) => void | Promise<void>;
}

/** Real owned networking, denying all operations unless a test supplies a handler. */
export async function createWorkflowEngineFixture(options: WorkflowEngineFixtureOptions = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'stateset-workflow-engine-'));
  await chmod(directory, 0o700);
  let caPath: string | undefined;
  let server:
    ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer> | undefined;
  const sockets = new Set<Socket>();
  const requests: WorkflowEngineFixtureRequest[] = [];
  let tlsFailures = 0;
  let handlerErrors = 0;
  let ambientRootProbeCount = 0;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing)
      closing = (async () => {
        try {
          const stopping = server?.listening
            ? new Promise<void>((resolve, reject) => {
                server!.close((error) => (error ? reject(error) : resolve()));
              })
            : Promise.resolve();
          for (const socket of sockets) socket.destroy();
          await stopping;
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      })();
    return closing;
  };
  try {
    let credentials: { key: Buffer; cert: Buffer } | undefined;
    if (options.https) {
      caPath = path.join(directory, 'ca.pem');
      // Use owned, explicitly selected extension sections rather than relying on
      // the workstation's OpenSSL configuration to issue a usable root CA.
      await writeFile(
        path.join(directory, 'ca.cnf'),
        [
          '[req]',
          'distinguished_name=dn',
          'prompt=no',
          'x509_extensions=v3_ca',
          '[dn]',
          'CN=StateSet owned workflow test CA',
          '[v3_ca]',
          'basicConstraints=critical,CA:TRUE',
          'keyUsage=critical,keyCertSign,cRLSign',
          'subjectKeyIdentifier=hash',
          'authorityKeyIdentifier=keyid:always',
        ].join('\n') + '\n',
        { mode: 0o600 }
      );
      await execute(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-sha256',
          '-days',
          '2',
          '-config',
          'ca.cnf',
          '-extensions',
          'v3_ca',
          '-keyout',
          'ca.key',
          '-out',
          'ca.pem',
        ],
        { cwd: directory }
      );
      await writeFile(
        path.join(directory, 'server.cnf'),
        [
          '[req]',
          'distinguished_name=dn',
          'prompt=no',
          '[dn]',
          'CN=127.0.0.1',
          '[v3_server]',
          'basicConstraints=critical,CA:FALSE',
          'keyUsage=critical,digitalSignature,keyEncipherment',
          'extendedKeyUsage=serverAuth',
          'subjectKeyIdentifier=hash',
          'authorityKeyIdentifier=keyid:always,issuer',
          'subjectAltName=IP:127.0.0.1',
        ].join('\n') + '\n',
        { mode: 0o600 }
      );
      await execute(
        'openssl',
        [
          'req',
          '-new',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-sha256',
          '-config',
          'server.cnf',
          '-keyout',
          'server.key',
          '-out',
          'server.csr',
        ],
        { cwd: directory }
      );
      await execute(
        'openssl',
        [
          'x509',
          '-req',
          '-in',
          'server.csr',
          '-CA',
          'ca.pem',
          '-CAkey',
          'ca.key',
          '-CAcreateserial',
          '-days',
          '2',
          '-sha256',
          '-extfile',
          'server.cnf',
          '-extensions',
          'v3_server',
          '-out',
          'server.pem',
        ],
        { cwd: directory }
      );
      await Promise.all(
        ['ca.key', 'server.key'].map((name) => chmod(path.join(directory, name), 0o600))
      );
      const [rootPem, leafPem, privateKey] = await Promise.all([
        readFile(caPath),
        readFile(path.join(directory, 'server.pem')),
        readFile(path.join(directory, 'server.key')),
      ]);
      const root = new X509Certificate(rootPem);
      const leaf = new X509Certificate(leafPem);
      if (!root.ca || root.subject !== root.issuer || !root.verify(root.publicKey))
        throw new Error('The owned workflow fixture root is not a self-signed CA.');
      if (
        leaf.ca ||
        !leaf.checkIssued(root) ||
        !leaf.verify(root.publicKey) ||
        leaf.checkIP('127.0.0.1') !== '127.0.0.1'
      )
        throw new Error('The owned workflow fixture leaf has an invalid issuer or loopback SAN.');
      const now = Date.now();
      for (const certificate of [root, leaf]) {
        const validFrom = Date.parse(certificate.validFrom);
        const validTo = Date.parse(certificate.validTo);
        if (
          !Number.isFinite(validFrom) ||
          !Number.isFinite(validTo) ||
          now < validFrom ||
          now > validTo
        )
          throw new Error('The owned workflow fixture certificate is not currently valid.');
      }
      // Also validate CA constraints, server purpose and the IP with the tool
      // that issued the certificates, before a failing fixture can accept traffic.
      await execute(
        'openssl',
        [
          'verify',
          '-CAfile',
          'ca.pem',
          '-purpose',
          'sslserver',
          '-verify_ip',
          '127.0.0.1',
          'server.pem',
        ],
        { cwd: directory }
      );
      credentials = {
        key: privateKey,
        cert: leafPem,
      };
    }
    const receive = (request: IncomingMessage, response: ServerResponse) => {
      // Workstation service discovery can probe open ports. Exclude only its
      // unauthenticated GET /; every workflow request and every POST stays strict.
      if (
        request.method === 'GET' &&
        request.url === '/' &&
        request.headers.authorization === undefined &&
        request.headers['x-tenant-id'] === undefined
      ) {
        ambientRootProbeCount++;
        response.writeHead(404).end();
        return;
      }
      // Query strings, credentials and bodies are deliberately absent from evidence.
      const observed: WorkflowEngineFixtureRequest = {
        method: request.method ?? '',
        path: new URL(request.url ?? '/', 'http://fixture.invalid').pathname,
        authorizationMatches:
          options.apiKey !== undefined &&
          [`Bearer ${options.apiKey}`, `ApiKey ${options.apiKey}`].includes(
            request.headers.authorization ?? ''
          ),
        tenantMatches:
          options.tenantId !== undefined && request.headers['x-tenant-id'] === options.tenantId,
        lastEventIdAbsent: request.headers['last-event-id'] === undefined,
        lastEventIdMatches:
          options.lastEventId !== undefined &&
          request.headers['last-event-id'] === String(options.lastEventId),
        acceptsEventStream: request.headers.accept === 'text/event-stream',
      };
      requests.push(observed);
      const handling = async () => {
        if (options.handler) await options.handler(request, response, observed);
        else
          response
            .writeHead(404, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ message: 'No engine operation is allowed in this fixture.' }));
      };
      void handling().catch(() => {
        handlerErrors++;
        if (!response.headersSent) response.writeHead(500).end('Fixture handler failed');
        else response.destroy();
      });
    };
    server = credentials ? createHttpsServer(credentials, receive) : createHttpServer(receive);
    server.on('connection', (socket: Socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    if (credentials)
      server.on('tlsClientError', () => {
        tlsFailures++;
      });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    return {
      url: `${options.https ? 'https' : 'http'}://127.0.0.1:${(server.address() as AddressInfo).port}`,
      requests,
      caPath,
      get tlsFailures() {
        return tlsFailures;
      },
      get handlerErrors() {
        return handlerErrors;
      },
      get ambientRootProbeCount() {
        return ambientRootProbeCount;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
