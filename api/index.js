/**
 * 酷狗音乐聚合搜索 API（龙珠源）
 * Author: your-name
 * Date: 2024-08-02
 */

const express = require('express');
const axios   = require('axios');
const app     = express();

/* ---------- 公共配置 ---------- */
const SEARCH_API = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.hhlqilongzhu.cn/',
  Connection: 'keep-alive'
};

/* ---------- 工具：并发 + 重试 ---------- */
async function concurrentFetch(items, fetchFn, concurrency = 3, retries = 3) {
  const results   = [];
  const executing = [];

  const attemptFetch = async (item) => {
    for (let i = 1; i <= retries; i++) {
      try {
        return await fetchFn(item);
      } catch (err) {
        console.warn(`🔄 歌曲 ${item.title} 第 ${i} 次重试失败：${err.message}`);
        if (i === retries) {
          return { ...item, cover: '', music_url: '', lyrics: '重试多次失败' };
        }
      }
    }
  };

  for (const item of items) {
    const p = Promise.resolve().then(() => attemptFetch(item));
    results.push(p);

    if (concurrency <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/* ---------- 工具：获取单曲详情 ---------- */
async function enrichSongDetails(song, baseParams) {
  try {
    const { data } = await axios.get(SEARCH_API, {
      params: { ...baseParams, n: song.n },
      headers: HEADERS,
      timeout: 15000
    });

    return {
      ...song,
      cover:     data.cover      || data.album_cover || '',
      music_url: data.url        || data.music_url  || '',
      lyrics:    data.lyrics     || data.song_lyrics || '暂无歌词'
    };
  } catch (err) {
    console.error(`❌ 获取 ${song.title} 详情失败：${err.message}`);
    return { ...song, cover: '', music_url: '', lyrics: '获取失败' };
  }
}

/* ---------- 主接口：/search ---------- */
app.get('/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const { msg, num = 30, type = 'json', quality = 'flac' } = req.query;
    if (!msg) {
      return res.status(400).json({ code: 400, message: 'msg 参数必填' });
    }

    // 1️⃣ 拉取歌曲列表
    const { data: listResp } = await axios.get(SEARCH_API, {
      params: { msg, n: '', num, type, quality },
      headers: HEADERS,
      timeout: 15000
    });

    if (!Array.isArray(listResp?.data) || listResp.data.length === 0) {
      return res.status(404).json({ code: 404, message: '未找到相关歌曲' });
    }

    // 2️⃣ 并发补全详情
    const songs = await concurrentFetch(
      listResp.data,
      (s) => enrichSongDetails(s, { msg, type, quality }),
      3, 3
    );

    // 3️⃣ 统一字段格式
    const payload = songs.map((s) => ({
      n:         s.n        || 0,
      title:     s.title    || '未知标题',
      singer:    s.singer   || '未知歌手',
      duration:  s.Duration || '00:00',
      cover:     s.cover    || 'https://your-default-cover-url.com',
      music_url: s.music_url,
      lyrics:    s.lyrics
    }));

    res.json({ code: 200, message: 'success', total: payload.length, data: payload });
  } catch (error) {
    console.error('🚨 /search 异常:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

/* ---------- 首页说明 ---------- */
app.get('/', (_, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>酷狗音乐搜索 API</title>
        <style>
          body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial; padding: 2rem; background:#fafafa; }
          a { color:#1677ff; text-decoration:none; }
        </style>
      </head>
      <body>
        <h1>🎵 酷狗音乐聚合搜索 API</h1>
        <p>调用示例：</p>
        <ul>
          <li><a href="/search?msg=周杰伦&num=10&quality=flac">周杰伦 / 高音质</a></li>
          <li><a href="/search?msg=邓紫棋&num=20&quality=128">邓紫棋 / 普通音质</a></li>
        </ul>
        <p>参数说明：</p>
        <pre>{
  msg     : 搜索关键词（必填）
  num     : 返回条数（默认30）
  type    : 返回格式（默认json）
  quality : 音质（128 / 320 / flac）
}</pre>
      </body>
    </html>
  `);
});

/* ---------- Vercel Serverless Export ---------- */
module.exports = app;
