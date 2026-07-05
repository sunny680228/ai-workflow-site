const memoryStore = globalThis.__sunnyPolls || {
  polls: new Map()
};

globalThis.__sunnyPolls = memoryStore;

const pollSetKey = 'sunny-poll:polls';
const pollKey = (id) => `sunny-poll:poll:${id}`;

function getKvConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
  };
}

function hasKv() {
  const { url, token } = getKvConfig();
  return Boolean(url && token);
}

async function kvCommand(command, ...args) {
  const { url, token } = getKvConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([command, ...args])
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `KV command failed: ${command}`);
  }

  const data = await response.json();
  return data.result;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function cleanOption(option, index) {
  return {
    id: String(option.id || `option-${index + 1}`),
    text: String(option.text || `選項 ${index + 1}`),
    icon: String(option.icon || ['🌿', '☁️', '⭐', '💡', '🫧'][index % 5]),
    color: String(option.color || ['#aeb8a5', '#9fb2bf', '#d8afa9', '#aaa2c5', '#c5aa98'][index % 5]),
    votes: Math.max(0, Number(option.votes || 0))
  };
}

function cleanPoll(poll) {
  const now = Date.now();
  const options = Array.isArray(poll.options) ? poll.options.map(cleanOption) : [];
  const voters = poll.voters && typeof poll.voters === 'object' ? poll.voters : {};

  return {
    id: String(poll.id || ''),
    title: String(poll.title || '線上投票器'),
    question: String(poll.question || '你想投給哪一個選項？'),
    closed: Boolean(poll.closed),
    closeAt: poll.closeAt ? Number(poll.closeAt) : 0,
    createdAt: Number(poll.createdAt || now),
    updatedAt: Number(poll.updatedAt || now),
    options,
    voters
  };
}

function applyTimeClose(poll) {
  if (poll.closeAt && Date.now() >= poll.closeAt) {
    poll.closed = true;
  }
  return poll;
}

async function getPoll(id) {
  if (!id) return null;

  if (!hasKv()) {
    const poll = memoryStore.polls.get(id) || null;
    return poll ? applyTimeClose(poll) : null;
  }

  const raw = await kvCommand('GET', pollKey(id));
  return raw ? applyTimeClose(JSON.parse(raw)) : null;
}

async function listPolls() {
  if (!hasKv()) {
    return [...memoryStore.polls.values()]
      .map(applyTimeClose)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);
  }

  const ids = await kvCommand('SMEMBERS', pollSetKey);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const polls = await Promise.all(ids.map((id) => getPoll(id)));
  return polls
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 50);
}

async function savePoll(poll) {
  const cleaned = cleanPoll(poll);
  if (!cleaned.id) throw new Error('missing poll id');
  cleaned.updatedAt = Date.now();

  if (!hasKv()) {
    memoryStore.polls.set(cleaned.id, cleaned);
    return cleaned;
  }

  await kvCommand('SET', pollKey(cleaned.id), JSON.stringify(cleaned));
  await kvCommand('SADD', pollSetKey, cleaned.id);
  return cleaned;
}

async function deletePoll(id) {
  if (!id) return;

  if (!hasKv()) {
    memoryStore.polls.delete(id);
    return;
  }

  await kvCommand('DEL', pollKey(id));
  await kvCommand('SREM', pollSetKey, id);
}

function removePreviousVote(poll, voterId) {
  const previous = poll.voters[voterId];
  if (!previous) return;
  const option = poll.options.find((item) => item.id === previous);
  if (option) option.votes = Math.max(0, option.votes - 1);
}

async function updatePoll(id, body) {
  const poll = cleanPoll((await getPoll(id)) || { id });

  if (body.action === 'vote') {
    applyTimeClose(poll);
    if (poll.closed) {
      const error = new Error('poll closed');
      error.statusCode = 409;
      throw error;
    }

    const voterId = String(body.voterId || '');
    const optionId = String(body.optionId || '');
    const option = poll.options.find((item) => item.id === optionId);
    if (!voterId || !option) throw new Error('missing vote data');

    removePreviousVote(poll, voterId);
    option.votes += 1;
    poll.voters[voterId] = optionId;
  }

  if (body.action === 'close') poll.closed = true;
  if (body.action === 'open') poll.closed = false;
  if (body.action === 'setTime') poll.closeAt = body.closeAt ? Number(body.closeAt) : 0;

  return savePoll(poll);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const id = typeof req.query.id === 'string' ? req.query.id : '';

    if (req.method === 'GET') {
      if (id) {
        const poll = await getPoll(id);
        return res.status(200).json({ poll, storage: hasKv() ? 'vercel-kv' : 'memory' });
      }

      const polls = await listPolls();
      return res.status(200).json({ polls, storage: hasKv() ? 'vercel-kv' : 'memory' });
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const poll = await savePoll({ ...body, id: id || body.id });
      return res.status(200).json({ poll, storage: hasKv() ? 'vercel-kv' : 'memory' });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const poll = await updatePoll(id || body.id, body);
      return res.status(200).json({ poll, storage: hasKv() ? 'vercel-kv' : 'memory' });
    }

    if (req.method === 'DELETE') {
      await deletePoll(id);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'server error' });
  }
};
