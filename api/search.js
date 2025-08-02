// api/search.js
const axios = require('axios');

const UPSTREAM = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 带重试的并发包装
async function concurrentFetch(items, fn, concurrency = 3, retries = 2) {
  const results = [];
  const executing = [];
  const run = async (item) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(item);
      } catch (e) {
        /* ignore */
      }
    }
    return { ...item, cover: '', music_url: '', lyrics: '' };
  };

  for (const item of items) {
    const p = run(item);
    results.push(p);
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// 单首歌曲详情
async function getDetails(song, base) {
  const { data } = await axios.get(UPSTREAM, {
    params: { ...base, n: song.n },
    timeout: 15000,
    headers: { 'User-Agent': UA },
  });
  return {
    ...song,
    cover: data?.cover || '',
    music_url: data?.music_url || '',
    lyrics: data?.lyrics || '暂无歌词',
  };
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { msg, num = 30, quality = 'flac' } = req.query;

  if (!msg) {
    return res.status(400).json({ code: 400, message: 'msg 必填' });
  }

  try {
    // 1. 先拿列表
    const { data } = await axios.get(UPSTREAM, {
      params: { msg, n: '', num, type: 'json', quality },
      headers: { 'User-Agent': UA },
    });
    const list = data?.data || [];
    if (!list.length) {
      return res.json({ code: 200, total: 0, data: [] });
    }

    // 2. 并发拿详情
    const base = { msg, type: 'json', quality };
    const results = await concurrentFetch(list, (s) => getDetails(s, base));

    res.json({
      code: 200,
      total: results.length,
      data: results.map((i) => ({
        n: i.n,
        title: i.title,
        singer: i.singer,
        Duration: i.Duration,
        cover: i.cover,
        music_url: i.music_url,
        lyrics: i.lyrics,
      })),
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
};
