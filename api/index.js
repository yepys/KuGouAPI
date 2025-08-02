// /api/index.js
const express = require('express');
const axios   = require('axios');
const app     = express();

/* ---------- 公共配置 ---------- */
const requestHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.hhlqilongzhu.cn/',
  'Connection': 'keep-alive'
};

/* ---------- 工具：并发 + 重试 ---------- */
async function fetchWithConcurrency(
  items,
  fetchFn,
  concurrency = 3,
  retries   = 3
) {
  const results   = [];
  const executing = [];

  const wrappedFetch = async (item) => {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await fetchFn(item);
      } catch (err) {
        attempt++;
        console.warn(`获取歌曲 "${item.title}" 第 ${attempt} 次失败：`, err.message);
      }
    }
    return { ...item, cover: '', music_url: '', lyrics: '重试多次失败' };
  };

  for (const item of items) {
    const p = Promise.resolve().then(() => wrappedFetch(item));
    results.push(p);

    if (concurrency <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

/* ---------- 工具：获取单曲详情 ---------- */
async function getSongDetails(song, baseParams) {
  try {
    const { data } = await axios.get(
      'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php',
      {
        params: { ...baseParams, n: song.n },
        headers: requestHeaders,
        timeout: 15000
      }
    );
    return {
      ...song,
      cover:     data.cover       || data.album_cover || '',
      music_url: data.url         || data.music_url   || '',
      lyrics:    data.lyrics      || data.song_lyrics || '暂无歌词'
    };
  } catch (err) {
    console.error(`获取歌曲 "${song.title}" 详情失败:`, err.message);
    return { ...song, cover: '', music_url: '', lyrics: '获取失败' };
  }
}

/* ---------- 主接口 ---------- */
app.get('/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const { msg, num = 30, type = 'json', quality = 'flac' } = req.query;
    if (!msg) {
      return res.status(400).json({ code: 400, error: 'msg 必填' });
    }

    // 1. 拉歌曲列表
    const { data: listData } = await axios.get(
      'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php',
      {
        params: { msg, n: '', num, type, quality },
        headers: requestHeaders,
        timeout: 15000
      }
    );
    if (!listData?.data?.length) {
      return res.status(500).json({ code: 500, error: '列表获取失败' });
    }

    // 2. 并发补全详情
    const detailedSongs = await fetchWithConcurrency(
      listData.data,
      s => getSongDetails(s, { msg, type, quality }),
      3, 3
    );

    // 3. 兜底字段
    const final = detailedSongs.map(s => ({
      n: s.n,
      title: s.title,
      singer: s.singer,
      Duration: s.Duration,
      cover: s.cover || 'https://your-default-cover-url.com',
      music_url: s.music_url || '',
      lyrics: s.lyrics || '暂无歌词'
    }));

    res.json({ code: 200, message: 'success', total: final.length, data: final });
  } catch (e) {
    console.error('搜索流程异常:', e);
    res.status(500).json({ code: 500, error: '服务器错误' });
  }
});

/* ---------- 首页说明 ---------- */
app.get('/', (_, res) => {
  res.send(`
    <h1>酷狗音乐搜索 API 服务</h1>
    <p>调用示例：<a href="/search?msg=周杰伦&num=40&quality=128">/search?msg=周杰伦&num=40&quality=128</a></p>
    <p>参数：msg(必填)、num(默认30)、quality(128/flac/320)</p>
  `);
});

/* ---------- 导出给 Vercel ---------- */
module.exports = app;
