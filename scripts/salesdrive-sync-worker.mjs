#!/usr/bin/env node
if(process.argv.includes('--help')) {
  process.stdout.write('SALESDRIVE_SYNC_ORIGIN=https://your-app.example CRON_SECRET=<secret> node scripts/salesdrive-sync-worker.mjs [--once]\n');
  process.exit(0);
}
const origin=new URL(process.env.SALESDRIVE_SYNC_ORIGIN ?? 'invalid');
if(origin.protocol!=='https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/') throw new Error('SALESDRIVE_SYNC_ORIGIN must be a plain HTTPS origin');
const secret=process.env.CRON_SECRET;
if(!secret || secret.length<16) throw new Error('CRON_SECRET must contain at least 16 characters');
const endpoint=new URL('/api/cron/salesdrive-sync',origin);
async function tick() {
  try {
    const response=await fetch(endpoint,{headers:{authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(55_000)});
    process.stdout.write(JSON.stringify({event:'salesdrive-sync-tick',ok:response.ok,status:response.status,at:new Date().toISOString()})+'\n');
    await response.body?.cancel();
    return response.ok;
  } catch {
    process.stderr.write(JSON.stringify({event:'salesdrive-sync-tick',ok:false,error:'TICK_UNAVAILABLE',at:new Date().toISOString()})+'\n');
    return false;
  }
}
if(process.argv.includes('--once')) process.exitCode=await tick()?0:1;
else while(true) {
  const started=Date.now();
  await tick();
  await new Promise(resolve=>setTimeout(resolve,Math.max(1000,60_000-(Date.now()-started))));
}
