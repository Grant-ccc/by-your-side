import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { MysqlChatStore } from './store.js';
const config=getConfig();
const app=buildApp(new MysqlChatStore(),{port:config.port,webPort:config.webPort,logger:true});
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{void app.close().then(()=>{process.exitCode=0})});
try { await app.listen({host:config.host,port:config.port}); }
catch { console.error('API could not start. Check whether its local port is already in use.'); await app.close();process.exitCode=1; }
