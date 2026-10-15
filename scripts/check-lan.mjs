// Real HTTPS + device credential + MySQL check. No model generation is requested.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { X509Certificate, randomUUID } from 'node:crypto';
import { MysqlChatStore } from '../apps/server/src/store.ts';
const local = JSON.parse(await readFile(new URL('../.local/lan/server.json', import.meta.url), 'utf8'));
const cert = await readFile(new URL('../.local/lan/cert.pem', import.meta.url));
const fingerprint = new X509Certificate(cert).fingerprint256;
function request(path, data, token = local.token, expectedPin = fingerprint, origin) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:local.host, port:local.port, path,
      method:data === undefined ? 'GET' : 'POST', ca:cert, agent:false,
      checkServerIdentity(host, peer) { return checkServerIdentity(host, peer) || (peer.fingerprint256 !== expectedPin ? new Error('CERTIFICATE_PIN_MISMATCH') : undefined); },
      headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(origin ? { Origin:origin } : {}) },
    }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
      res.on('end', () => { try { resolve({ status:res.statusCode, data:JSON.parse(text) }); } catch { reject(new Error('Invalid response')); } });
    });
    req.setTimeout(8000, () => req.destroy(new Error('LAN check timed out')));
    req.on('error', reject); if (data !== undefined) req.write(JSON.stringify(data)); req.end();
  });
}
const store = new MysqlChatStore();
let conversationId;
try {
  assert.equal((await request('/health', undefined, '')).status, 401);
  assert.equal((await request('/health', undefined, 'wrong')).status, 401);
  await assert.rejects(() => request('/health', undefined, local.token, 'wrong'), /CERTIFICATE_PIN_MISMATCH/);
  assert.equal((await request('/health', undefined, local.token, fingerprint, 'https://evil.example')).status, 403);
  assert.equal((await request('/health')).data.database, 'connected');
  await request('/api/bootstrap');
  const created = await request('/api/conversations', { title:`lan-check-${randomUUID()}` });
  assert.equal(created.status, 201); conversationId = created.data.conversation.id;
  const input = { clientRequestId:randomUUID(), text:'局域网合成连通性检查 🧸' };
  const first = await request(`/api/conversations/${conversationId}/messages`, input);
  const duplicate = await request(`/api/conversations/${conversationId}/messages`, input);
  assert.equal(first.status, 201); assert.equal(duplicate.status, 200);
  assert.equal(first.data.message.id, duplicate.data.message.id);
  const history = await request(`/api/conversations/${conversationId}/messages?after=0&limit=50`);
  assert.equal(history.data.messages.length, 1); assert.equal(history.data.messages[0].text, input.text);
  console.log('PASS: real HTTPS, host verification, certificate pin mismatch rejection, device credentials, MySQL persistence and dedupe. No AI call. Phone reachability remains unverified.');
} finally {
  if (conversationId) await store.pool.execute('DELETE FROM conversations WHERE id=?', [conversationId]);
  await store.close();
}
