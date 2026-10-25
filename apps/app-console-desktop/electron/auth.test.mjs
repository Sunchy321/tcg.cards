import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from 'playwright';

const USERNAME = 'operator';
const PASSWORD = 'e2e-secret-password-xyz';
const TOKEN = 'e2e-session-token-xyz';
const databaseUrl = () => process.env.DATABASE_URL;

/** Console-backend stub with an in-memory session shared by every app launch. */
async function consoleBackend() {
  const state = { session: null, admissionStatus: 200 };
  const server = createServer((request, response) => {
    if (request.url === '/auth/sign-in/username' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => body += chunk);
      request.on('end', () => {
        const credentials = JSON.parse(body);
        if (credentials.username !== USERNAME || credentials.password !== PASSWORD) {
          response.statusCode = 401;
          response.end('{}');
          return;
        }
        state.session = { token: TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
        response.setHeader('set-cookie', [`better-auth.session_token=${TOKEN}; Path=/; HttpOnly`]);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ session: { expiresAt: state.session.expiresAt }, user: { username: USERNAME } }));
      });
      return;
    }
    if (request.url === '/auth/sign-out' && request.method === 'POST') {
      state.session = null;
      response.end('{}');
      return;
    }
    if (request.url === '/publish/admission' && request.method === 'POST') {
      response.statusCode = state.admissionStatus;
      response.setHeader('content-type', 'application/json');
      response.end(state.admissionStatus === 200 ? '{"allowed":true,"game":"magic","userId":"user-123"}' : '{"allowed":false}');
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    state,
    async close() {
      await new Promise(resolve => server.close(resolve));
    },
  };
}

/** Launches the console with a reusable profile while capturing every stderr byte. */
async function launchConsole(profile) {
  const executablePath = process.env.ELECTRON_TEST_EXECUTABLE;
  const app = await electron.launch({
    ...(executablePath ? { executablePath, cwd: tmpdir() } : {}),
    args:    [...(executablePath ? [] : ['.']), '--smoke-test', `--user-data-dir=${profile}`],
    env:     { ...process.env, VITE_DEV_SERVER_URL: '' },
    timeout: 60_000,
  });
  const stderr = [];
  app.process().stderr?.on('data', chunk => stderr.push(chunk.toString()));
  const page = await app.firstWindow();
  await page.getByText('最近活动', { exact: true }).waitFor();
  return { app, page, stderr };
}

/** Signs in through the real settings form. */
async function loginThroughSettings(page, baseUrl) {
  await page.evaluate(() => {
    window.location.hash = '#/settings/remote';
  });
  await page.getByText('控制台账号', { exact: true }).waitFor();
  await page.getByLabel('服务地址', { exact: true }).fill(baseUrl);
  await page.getByLabel('用户名', { exact: true }).fill(USERNAME);
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByText(`已登录：${USERNAME}`).waitFor();
}
/** Local pages and the login page itself never require a session. */
test('local pages load without login and the settings page offers the remote login', {
  timeout: 120_000,
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  const session = await launchConsole(profile);
  try {
    await session.page.evaluate(() => {
      window.location.hash = '#/dev/tasks';
    });
    await session.page.getByRole('heading', { name: '测试任务' }).waitFor();
    await session.page.evaluate(() => {
      window.location.hash = '#/settings/remote';
    });
    await session.page.getByText('控制台账号', { exact: true }).waitFor();
    await session.page.getByLabel('服务地址', { exact: true }).waitFor();
  } finally {
    await session.app?.close();
    await rm(profile, { recursive: true, force: true });
    await backend.close();
  }
});

/** Wrong credentials explain themselves and keep the form ready for a retry. */
test('wrong credentials show a clear error without leaking the password', {
  timeout: 120_000,
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  const session = await launchConsole(profile);
  try {
    await session.page.evaluate(() => {
      window.location.hash = '#/settings/remote';
    });
    await session.page.getByText('控制台账号', { exact: true }).waitFor();
    await session.page.getByLabel('服务地址', { exact: true }).fill(backend.baseUrl);
    await session.page.getByLabel('用户名', { exact: true }).fill(USERNAME);
    await session.page.getByLabel('密码', { exact: true }).fill('totally-wrong');
    await session.page.getByRole('button', { name: '登录', exact: true }).click();
    await session.page.getByText('用户名或密码不正确。').waitFor();

    const stderr = session.stderr.join('');
    assert.equal(stderr.includes('totally-wrong'), false);
    assert.equal(stderr.includes(PASSWORD), false);
    assert.equal(stderr.includes(TOKEN), false);
  } finally {
    await session.app?.close();
    await rm(profile, { recursive: true, force: true });
    await backend.close();
  }
});

/** A gated remote operation guides to the login and returns after signing in. */
test('a gated operation guides to login and returns to the operation afterwards', {
  timeout: 180_000,
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  const session = await launchConsole(profile);
  try {
    await session.page.evaluate(() => {
      window.location.hash = '#/dev/auth';
    });
    await session.page.getByRole('heading', { name: '登录与会话测试', level: 2 }).waitFor();
    await session.page.getByRole('button', { name: '执行需要登录的操作' }).click();

    // The prompt offers one click to the login page, with a way back afterwards.
    await session.page.getByText('此操作需要先登录', { exact: true }).waitFor();
    await session.page.getByRole('button', { name: '去登录' }).click();
    await session.page.getByText('登录后将返回之前的操作。').waitFor();
    assert.match(session.page.url(), /#\/settings\/remote\?return=/);

    await session.page.getByLabel('服务地址', { exact: true }).fill(backend.baseUrl);
    await session.page.getByLabel('用户名', { exact: true }).fill(USERNAME);
    await session.page.getByLabel('密码', { exact: true }).fill(PASSWORD);
    await session.page.getByRole('button', { name: '登录', exact: true }).click();
    await session.page.getByRole('heading', { name: '登录与会话测试', level: 2 }).waitFor();

    // Back at the operation, the gated action now proceeds.
    await session.page.getByRole('button', { name: '执行需要登录的操作' }).click();
    await session.page.getByText('操作已执行。').waitFor();
    const stderr = session.stderr.join('');
    assert.equal(stderr.includes(PASSWORD), false);
    assert.equal(stderr.includes(TOKEN), false);
  } finally {
    await session.app?.close();
    await rm(profile, { recursive: true, force: true });
    await backend.close();
  }
});

/** The encrypted session survives a real restart, and signing out ends it. */
test('the session persists across restarts and logout clears it', {
  timeout: 240_000,
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  try {
    const first = await launchConsole(profile);
    try {
      await loginThroughSettings(first.page, backend.baseUrl);
    } finally {
      await first.app.close();
    }

    const second = await launchConsole(profile);
    try {
      await second.page.evaluate(() => {
        window.location.hash = '#/settings/remote';
      });
      await second.page.getByText(`已登录：${USERNAME}`).waitFor();

      await second.page.getByRole('button', { name: '登出', exact: true }).click();
      await second.page.getByLabel('服务地址', { exact: true }).waitFor();
    } finally {
      await second.app.close();
    }

    // After logout the third launch starts logged out again.
    const third = await launchConsole(profile);
    try {
      await third.page.evaluate(() => {
        window.location.hash = '#/settings/remote';
      });
      await third.page.getByLabel('服务地址', { exact: true }).waitFor();
    } finally {
      await third.app.close();
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
    await backend.close();
  }
});

/** Publish admission refusals stop the development publish task before it starts. */
test('admission refusals stop the publish task before it starts', {
  timeout: 180_000,
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  const session = await launchConsole(profile);
  try {
    // Local prerequisites come first, so the admission cases need a database string.
    await session.page.evaluate(
      url => window.desktop.settings.setSecret('database', url),
      'postgresql://admission-check@localhost:5432/unused',
    );
    // Without a session the gate refuses before any request leaves the app.
    const noSession = await session.page.evaluate(async () => {
      try {
        await window.desktop.tasks.start('dev_publish', { steps: 4 });
        return null;
      } catch (error) {
        return error.message;
      }
    });
    assert.match(noSession, /需要先登录/);

    await loginThroughSettings(session.page, backend.baseUrl);

    // A denied account never creates a run.
    backend.state.admissionStatus = 403;
    const denied = await session.page.evaluate(async () => {
      try {
        await window.desktop.tasks.start('dev_publish', { steps: 4 });
        return null;
      } catch (error) {
        return error.message;
      }
    });
    assert.match(denied, /没有发布万智牌/);

    // An unreachable backend fails closed instead of skipping the check.
    backend.state.admissionStatus = 200;
    await backend.close();
    const unreachable = await session.page.evaluate(async () => {
      try {
        await window.desktop.tasks.start('dev_publish', { steps: 4 });
        return null;
      } catch (error) {
        return error.message;
      }
    });
    assert.match(unreachable, /无法连接服务/);
  } finally {
    await session.app?.close();
    await rm(profile, { recursive: true, force: true });
    await backend.close().catch(() => {});
  }
});

/** An admitted publish task runs to completion through the real gate. */
test('an admitted publish task runs to completion', {
  timeout: 180_000,
  skip:    !databaseUrl(),
}, async () => {
  const backend = await consoleBackend();
  const profile = await mkdtemp(join(tmpdir(), 'console-auth-'));
  const session = await launchConsole(profile);
  try {
    await session.page.evaluate(url => window.desktop.settings.setSecret('database', url), databaseUrl());
    await loginThroughSettings(session.page, backend.baseUrl);
    const started = await session.page.evaluate(() => window.desktop.tasks.start('dev_publish', { steps: 4 }));
    assert.equal(started.existing, false);
    for (let attempt = 0; attempt < 80; attempt++) {
      const task = await session.page.evaluate(id => window.desktop.tasks.get(id), started.taskRunId);
      if (task?.status === 'completed') {
        assert.equal(task.stages[0].done, 4);
        return;
      }
      if (task?.status === 'failed') throw new Error(task.errorMessage ?? 'publish task failed');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('publish task never completed');
  } finally {
    await session.app?.close();
    await rm(profile, { recursive: true, force: true });
    await backend.close();
  }
});
