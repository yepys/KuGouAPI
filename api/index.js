/**
 * 🎵 酷狗音乐聚合搜索 API（龙珠源）
 *  1. /search   搜索歌曲
 *  2. /docs    带代码高亮的文档
 *
 * 本地：npm run dev
 * Docker：docker compose up
 */
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const chalk   = require('chalk');
const Joi     = require('joi');

const app = express();
const SEARCH_API = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.hhlqilongzhu.cn/'
};

// ---------- 彩色日志 ----------
const log = {
  info:  (m) => console.log(chalk.cyan(`ℹ  ${m}`)),
  ok:    (m) => console.log(chalk.green(`✅ ${m}`)),
  warn:  (m) => console.log(chalk.yellow(`⚠  ${m}`)),
  error: (m) => console.log(chalk.red(`❌ ${m}`))
};

// ---------- 参数校验 ----------
const searchSchema = Joi.object({
  msg: Joi.string().min(1).max(64).required(),
  num: Joi.number().integer().min(1).max(100).default(30),
  quality: Joi.string().valid('128', '320', 'flac', 'viper_atmos').default('viper_atmos')
});

// ---------- 并发+重试 ----------
async function concurrentFetch(items, fetchFn, concurrency = 3, retries = 3) {
  const results = [];
  const running = [];

  const attempt = async (item) => {
    for (let i = 1; i <= retries; i++) {
      try {
        return await fetchFn(item);
      } catch (err) {
        log.warn(`重试 ${i}/${retries}：${item.title} – ${err.message}`);
        if (i === retries) {
          return { ...item, cover: '', music_url: '', lyrics: '' };
        }
      }
    }
  };

  for (const item of items) {
    const p = Promise.resolve().then(() => attempt(item));
    results.push(p);
    if (running.length >= concurrency) {
      await Promise.race(running);
    }
    const e = p.then(() => running.splice(running.indexOf(e), 1));
    running.push(e);
  }
  return Promise.all(results);
}

// ---------- 获取单曲详情 ----------
async function enrichSong(song, base) {
  try {
    const { data } = await axios.get(SEARCH_API, {
      params: { ...base, n: song.n },
      headers: HEADERS,
      timeout: 15000
    });
    return {
      ...song,
      cover: data.cover || data.album_cover || '',
      music_url: data.url || data.music_url || '',
      lyrics: data.lyrics || data.song_lyrics || ''
    };
  } catch (e) {
    log.error(`获取详情失败：${song.title} – ${e.message}`);
    return { ...song, cover: '', music_url: '', lyrics: '' };
  }
}

// ---------- 主接口 ----------
app.get('/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const { error, value } = searchSchema.validate(req.query);
  if (error) {
    return res.status(400).json({ code: 400, message: error.details[0].message });
  }

  try {
    const { msg, num, quality } = value;

    const { data: listResp } = await axios.get(SEARCH_API, {
      params: { msg, n: '', num, type: 'json', quality },
      headers: HEADERS,
      timeout: 15000
    });

    if (!Array.isArray(listResp?.data) || listResp.data.length === 0) {
      return res.status(404).json({ code: 404, message: '未找到相关歌曲' });
    }

    const songs = await concurrentFetch(
      listResp.data,
      (s) => enrichSong(s, { msg, quality }),
      3,
      3
    );

    const payload = songs.map((s) => ({
      id: s.n || 0,
      title: s.title || '未知标题',
      singer: s.singer || '未知歌手',
      duration: s.Duration || '00:00',
      cover:
        s.cover ||
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=60',
      music_url: s.music_url,
      lyrics: s.lyrics || '📃 暂无歌词'
    }));

    res.json({ code: 200, message: 'success', total: payload.length, data: payload });
    log.ok(`搜索「${msg}」返回 ${payload.length} 条`);
  } catch (e) {
    log.error(`搜索接口异常：${e.message}`);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ---------- 文档页 ----------
app.get('/docs', (_, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>🎵 API 文档</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css"/>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;padding:2rem;background:#1e1e1e;color:#f8f8f2;}
    h1,h2{color:#66d9ef;}
    pre{background:#2d2d2d;border-radius:8px;padding:1rem;overflow-x:auto;}
    code{color:#a6e22e;}
    .endpoint{background:#3a3a3a;border-left:4px solid #66d9ef;padding:.5rem 1rem;margin:.5rem 0;}
    a{color:#ae81ff}
  </style>
</head>
<body>
  <h1>🎵 酷狗音乐聚合搜索 API 文档</h1>

  <h2>1. 接口地址</h2>
  <div class="endpoint"><b>GET</b> /search</div>

  <h2>2. 请求参数</h2>
  <pre><code class="language-json">{
  "msg":     "搜索关键词（必填）",
  "num":     "返回条数(1-100, 默认30)",
  "quality": "音质(128/320/flac, 默认flac)"
}</code></pre>

  <h2>3. 调用示例</h2>
  <pre><code class="language-bash">curl "https://kugouapi.xtyun.click/search?msg=唯一&num=5&quality=flac"</code></pre>

  <h2>4. 返回示例</h2>
  <pre><code class="language-json">{
  "code": 200,
  "message": "success",
  "total": 5,
  "data": [
    {
      "id": 1,
      "title": "唯一",
      "singer": "G.E.M. 邓紫棋",
      "duration": "4:13",
      "cover": "http://imge.kugou.com/stdmusic/400/20240122/20240122143605898824.jpg",
      "music_url": "https://er-sycdn.kuwo.cn/8feb36494a3bb34fe35b04f201698e79/688db889/resource/30106/trackmedia/M800001ziKgJ3o5Ipp.mp3?from=longzhu_api?from=longzhu_api",
      "lyrics": "..."
    }
  ]
}</code></pre>

  <h2>5. 错误码</h2>
  <ul>
    <li>400 – 参数缺失/不合法</li>
    <li>404 – 无结果</li>
    <li>500 – 服务器异常</li>
  </ul>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
</body>
</html>`);
});

// ---------- 根路径 ----------
app.get('/', (_, res) => res.redirect('/docs'));

// ---------- 启动 ----------
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => log.ok(`Server running → http://localhost:${PORT}`));

module.exports = app;
