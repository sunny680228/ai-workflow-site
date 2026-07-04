const memoryStore = globalThis.__sunnyDiscussionBoards || {
  boards: new Map()
};

globalThis.__sunnyDiscussionBoards = memoryStore;

const boardSetKey = 'sunny-discussion-wall:boards';
const boardKey = (id) => `sunny-discussion-wall:board:${id}`;

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(command, ...args) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
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

function cleanBoard(board) {
  const now = Date.now();
  return {
    id: String(board.id || ''),
    title: String(board.title || '互動討論牆'),
    archived: Boolean(board.archived),
    createdAt: Number(board.createdAt || now),
    updatedAt: Number(board.updatedAt || now),
    notes: Array.isArray(board.notes) ? board.notes : []
  };
}

async function getBoard(id) {
  if (!id) return null;

  if (!hasKv()) {
    return memoryStore.boards.get(id) || null;
  }

  const raw = await kvCommand('GET', boardKey(id));
  return raw ? JSON.parse(raw) : null;
}

async function listBoards() {
  if (!hasKv()) {
    return [...memoryStore.boards.values()]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);
  }

  const ids = await kvCommand('SMEMBERS', boardSetKey);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const boards = await Promise.all(ids.map((id) => getBoard(id)));
  return boards
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 50);
}

async function saveBoard(board) {
  const cleaned = cleanBoard(board);
  if (!cleaned.id) throw new Error('missing board id');
  cleaned.updatedAt = Date.now();

  if (!hasKv()) {
    memoryStore.boards.set(cleaned.id, cleaned);
    return cleaned;
  }

  await kvCommand('SET', boardKey(cleaned.id), JSON.stringify(cleaned));
  await kvCommand('SADD', boardSetKey, cleaned.id);
  return cleaned;
}

async function deleteBoard(id) {
  if (!id) return;

  if (!hasKv()) {
    memoryStore.boards.delete(id);
    return;
  }

  await kvCommand('DEL', boardKey(id));
  await kvCommand('SREM', boardSetKey, id);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const id = typeof req.query.id === 'string' ? req.query.id : '';

    if (req.method === 'GET') {
      if (id) {
        const board = await getBoard(id);
        return res.status(200).json({ board, storage: hasKv() ? 'vercel-kv' : 'memory' });
      }

      const boards = await listBoards();
      return res.status(200).json({ boards, storage: hasKv() ? 'vercel-kv' : 'memory' });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readJsonBody(req);
      const board = await saveBoard({ ...body, id: id || body.id });
      return res.status(200).json({ board, storage: hasKv() ? 'vercel-kv' : 'memory' });
    }

    if (req.method === 'DELETE') {
      await deleteBoard(id);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'server error' });
  }
};
