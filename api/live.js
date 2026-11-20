const { randomUUID, randomBytes } = require('crypto');
const modes = ['chat', 'mood', 'vote', 'closed'];
const uuid = /^[a-f0-9-]{36}$/;
const ttl = 86400;

async function redis(...command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw Error('storage');
  return data.result;
}

// Validate the round and apply the response in one Redis operation.
const update = `
local k=KEYS[1]
local mode=redis.call('HGET',k,'mode')
if not mode then return 404 end
if ARGV[1]=='switch' then
  if redis.call('HGET',k,'owner')~=ARGV[2] then return 403 end
  redis.call('HINCRBY',k,'round',1)
  redis.call('HSET',k,'mode',ARGV[3],'messages','[]','counts','[0,0,0,0]')
  return 200
end
if mode=='closed' or redis.call('HGET',k,'round')~=ARGV[2] then return 409 end
if ARGV[1]=='customMood' and mode~='mood' then return 409 end
if mode=='chat' then
  local messages=cjson.decode(redis.call('HGET',k,'messages'))
  table.insert(messages,{id=ARGV[5],text=ARGV[3]})
  if #messages>30 then table.remove(messages,1) end
  redis.call('HSET',k,'messages',cjson.encode(messages))
else
  local n=tonumber(ARGV[3])
  if ARGV[1]=='customMood' then n=5
  elseif not n or n~=math.floor(n) or n<1 or n>4 then return 400 end
  if redis.call('HSETNX',k,'v:'..ARGV[2]..':'..ARGV[4],1)==0 then return 200 end
  local counts=cjson.decode(redis.call('HGET',k,'counts'))
  counts[n]=(counts[n] or 0)+1
  if n==5 then
    local messages=cjson.decode(redis.call('HGET',k,'messages'))
    table.insert(messages,{id=ARGV[5],text=ARGV[3]})
    if #messages>30 then table.remove(messages,1) end
    redis.call('HSET',k,'messages',cjson.encode(messages))
  end
  redis.call('HSET',k,'counts',cjson.encode(counts))
end
return 200`;

module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try {
    const b = req.body || {};
    if (req.method === 'POST' && b.action === 'create') {
      const id=randomUUID(), owner=randomBytes(24).toString('hex');
      await redis('EVAL',"redis.call('HSET',KEYS[1],'owner',ARGV[1],'mode','chat','round',1,'messages','[]','counts','[0,0,0,0]'); return redis.call('EXPIRE',KEYS[1],ARGV[2])",1,'live:'+id,owner,ttl);
      return res.json({id,owner});
    }
    const id=req.query.id;
    if (!uuid.test(id)) return res.status(400).json({});
    const key='live:'+id;
    if (req.method==='GET') {
      const [mode,round,messages,counts]=await redis('HMGET',key,'mode','round','messages','counts');
      if (!mode) return res.status(404).json({});
      return res.json({mode,round:Number(round),messages:JSON.parse(messages),counts:JSON.parse(counts)});
    }
    if (req.method!=='POST') return res.status(405).json({});
    let args;
    if (b.action==='switch' && modes.includes(b.mode)) args=['switch',String(b.owner),b.mode];
    else if (['reply','customMood'].includes(b.action) && uuid.test(b.client) && typeof b.value==='string' && b.value.trim() && b.value.length<=120)
      args=[b.action,String(b.round),b.value.trim(),b.client,randomUUID()];
    else return res.status(400).json({});
    const code=await redis('EVAL',update,1,key,...args);
    res.status(code).json({ok:code===200});
  } catch { res.status(503).json({error:'暫時無法連線'}); }
};
