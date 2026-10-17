import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

async function endpoint(path) {
  const hashSource = readFileSync(new URL('../src/lib/credentials.ts', import.meta.url), 'utf8').replace('export async', 'async');
  const presenceSource = `
    const presenceCookieName = (code) => \`votalive_presence_\${code}\`;
    async function verifyPresenceToken(secret, code, token) {
      const [expiresAtText, signature] = token.split(".");
      const expiresAt = Number(expiresAtText);
      if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
      const binary = atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - signature.length % 4) % 4));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      return crypto.subtle.verify("HMAC", key, Uint8Array.from(binary, (character) => character.charCodeAt(0)), new TextEncoder().encode(\`presence:\${code}:\${expiresAt}\`));
    }
  `;
  const qrSource = readFileSync(new URL('../src/lib/qr.ts', import.meta.url), 'utf8');
  const sourcePath = path.startsWith('admin/')
    ? `../src/pages/API/${path}`
    : `../src/pages/api/polls/${path}`;
  const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8')
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.testEnv;')
    .replace(/import \{ hashCredential \} from .*;/, hashSource)
    .replace(/import \{[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/qr";/, stripTypeScriptTypes(qrSource))
    .replace('import { isValidCode } from "../../../../lib/security";', 'const isValidCode = (code) => /^[A-F0-9]{12}$/.test(code);')
    .replace(/import \{ presenceCookieName, verifyPresenceToken \} from .*;/, presenceSource);
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
}

async function qrLibrary() {
  const source = readFileSync(new URL('../src/lib/qr.ts', import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
}

test('API: validación, participantes, estados y voto único', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'));
  const wrapper = {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  globalThis.testEnv = { DB: wrapper, ADMIN_KEY: 'test-key', QR_SECRET: 'qr-test-secret' };
  const create = await endpoint('index.ts');
  const manage = await endpoint('[code]/manage.ts');
  const votes = await endpoint('[code]/votes.ts');
  const enter = await endpoint('[code]/enter.ts');
  const results = await endpoint('[code]/results.ts');
  const exportResults = await endpoint('[code]/export.ts');
  const adminPolls = await endpoint('admin/polls.ts');
  const call = (api, body, code = '', key = 'test-key') => api.POST({
    params: { code }, request: new Request('https://example.test/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify(body)
    })
  });
  assert.equal((await call(create, null)).status, 400);
  assert.equal((await call(create, [])).status, 400);
  assert.equal((await call(create, {}, '', 'wrong')).status, 401);
  assert.equal((await call(create, { question: 'Pregunta', options: ['Uno', 'uno'] })).status, 400);
  const response = await call(create, { question: '¿Quién será delegado?', options: ['Ana', 'Luis'] });
  assert.equal(response.status, 201);
  const { code } = await response.json();
  assert.match(code, /^[A-F0-9]{12}$/);
  const adminUnauthorized = await adminPolls.GET({
    request: new Request('https://example.test/api/admin/polls')
  });
  assert.equal(adminUnauthorized.status, 401);
  const adminResponse = await adminPolls.GET({
    request: new Request('https://example.test/api/admin/polls', {
      headers: { 'x-admin-key': 'test-key' }
    })
  });
  assert.equal(adminResponse.status, 200);
  const adminData = await adminResponse.json();
  assert.equal(adminData.polls.length, 1);
  assert.equal(adminData.polls[0].code, code);
  assert.equal(adminData.polls[0].authorized, 0);
  assert.equal(adminData.polls[0].participation, 0);
  assert.equal((await call(manage, { action: 'open' }, code)).status, 409);
  assert.equal((await call(manage, null, code)).status, 400);
  const participants = await call(manage, { action: 'participants', count: 2 }, code);
  assert.equal(participants.status, 200);
  const { credentials } = await participants.json();
  const optionId = db.prepare('SELECT id FROM options LIMIT 1').get().id;
  const vote = { optionId, credential: credentials[0] };
  assert.equal((await call(votes, vote, code)).status, 403, 'requiere acceso QR');
  assert.equal((await call(manage, { action: 'open' }, code)).status, 200);
  const openExport = await exportResults.GET({
    params: { code },
    request: new Request('https://example.test/api/export', {
      headers: { 'x-admin-key': 'test-key' }
    })
  });
  assert.equal(openExport.status, 409);
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  const payload = `presence:${code}:${expiresAt}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('qr-test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = `${expiresAt}.${Buffer.from(signature).toString('base64url')}`;
  const cookie = `votalive_presence_${code}=${token}`;
  const qr = await qrLibrary();
  const expiredSlot = qr.currentQrSlot() - 2;
  const expiredSignature = await qr.signQr('qr-test-secret', code, expiredSlot);
  const expiredEnter = await enter.POST({
    params: { code },
    request: new Request('https://example.test/API/polls/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: expiredSlot, sig: expiredSignature })
    })
  });
  assert.equal(expiredEnter.status, 403, 'rechaza QR caducado');
  assert.equal((await call(manage, { action: 'participants', count: 1 }, code)).status, 409);
  const voteCall = (body) => votes.POST({
    params: { code }, request: new Request('https://example.test/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body)
    })
  });
  assert.equal((await voteCall({ ...vote, credential: '0'.repeat(32) })).status, 409);
  assert.equal((await voteCall({ ...vote, optionId: 'otra-opcion' })).status, 409);
  assert.equal((await voteCall(vote)).status, 201);
  assert.equal((await voteCall(vote)).status, 409, 'no admite voto duplicado');
  assert.equal((await call(manage, { action: 'closed' }, code)).status, 200);
  assert.equal((await voteCall({ ...vote, credential: credentials[1] })).status, 409);
  assert.equal((await call(manage, { action: 'open' }, code)).status, 409);
  const unauthorizedResults = await results.GET({
    params: { code },
    request: new Request('https://example.test/api/results')
  });
  assert.equal(unauthorizedResults.status, 401);
  const resultResponse = await results.GET({
    params: { code },
    request: new Request('https://example.test/api/results', {
      headers: { 'x-admin-key': 'test-key' }
    })
  });
  assert.equal(resultResponse.status, 200);
  const resultData = await resultResponse.json();
  assert.equal(resultData.participation.authorized, 2);
  assert.equal(resultData.participation.totalVotes, 1);
  assert.equal(resultData.participation.pending, 1);
  assert.equal(resultData.participation.percentage, 50);
  assert.equal(resultData.options.find((option) => option.id === optionId).votes, 1);
  assert.equal(resultData.options.find((option) => option.id === optionId).percentage, 100);
  assert.equal(resultData.winner.type, 'winner');
  assert.equal(resultData.winner.votes, 1);
  db.prepare('UPDATE options SET name = ? WHERE id = ?').run('=FORMULA', optionId);
  const csvResponse = await exportResults.GET({
    params: { code },
    request: new Request('https://example.test/api/export', {
      headers: { 'x-admin-key': 'test-key' }
    })
  });
  assert.equal(csvResponse.status, 200);
  assert.equal(csvResponse.headers.get('content-type'), 'text/csv; charset=utf-8');
  const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
  assert.deepEqual(Array.from(csvBytes.slice(0, 3)), [0xEF, 0xBB, 0xBF]);
  const csv = new TextDecoder().decode(csvBytes);
  assert.match(csv, /'=FORMULA/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM votes').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM participants').get().n, 2);
  globalThis.testEnv.DB = undefined;
  const previousError = console.error;
  console.error = () => {};
  try {
    assert.equal((await call(create, { question: 'Pregunta válida', options: ['A', 'B'] })).status, 500);
  } finally { console.error = previousError; }
  db.close();
  delete globalThis.testEnv;
});

test('QR: la firma vigente se acepta y una ventana caducada se rechaza', async () => {
  const qr = await qrLibrary();
  const secret = 'qr-test-secret';
  const code = 'ABCDEF123456';
  const now = 1_800_000_000_000;
  const slot = qr.currentQrSlot(now);
  const signature = await qr.signQr(secret, code, slot);

  assert.equal(await qr.verifyQr(secret, code, slot, signature, now), true);
  assert.equal(await qr.verifyQr(secret, code, slot - 2, signature, now), false);
  assert.equal(await qr.verifyQr(secret, code, slot, signature.slice(0, -1) + 'x', now), false);
});
