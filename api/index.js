/**
 * 🎵 酷狗音乐聚合搜索 API（龙珠源）
 * 部署：vercel / docker / 本地皆可
 */

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const chalk   = require('chalk');
const Joi     = require('joi');

const app  = express();
const API  = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.hhlqilongzhu.cn/'
};

/* ---------- 工具 ---------- */
const log = {
  info:  (m) => console.log(chalk.cyan(`ℹ  ${m}`)),
  ok:    (m) => console.log(chalk.green(`✅ ${m}`)),
  warn:  (m) => console.log(chalk.yellow(`⚠  ${m}`)),
  error: (m) => console.log(chalk.red(`❌ ${m}`))
};

const searchSchema = Joi.object({
  msg: Joi.string().min(1).max(64).required(),
  num: Joi.number().integer().min(1).max(100).default(30),
  quality: Joi.string().valid('128', '320', 'flac').default('flac')
});

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=60';

/* ---------- 主接口 ---------- */
app.get('/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const { error, value } = searchSchema.validate(req.query);
  if (error) {
    return res.status(400).json({ code: 400, message: error.details[0].message });
  }

  try {
    const { msg, num, quality } = value;
    const { data } = await axios.get(API, {
      params: { msg, n: '', num, type: 'json', quality },
      headers: HEADERS,
      timeout: 15000
    });

    if (!Array.isArray(data?.data) || data.data.length === 0) {
      return res.status(404).json({ code: 404, message: '未找到相关歌曲' });
    }

    const payload = data.data.map((s) => ({
      id: s.n || 0,
      title: s.title || '未知标题',
      singer: s.singer || '未知歌手',
      duration: s.Duration || '00:00',
      cover: s.cover || s.album_cover || FALLBACK_COVER,
      music_url: s.url || s.music_url || '',
      lyrics: s.lyrics || s.song_lyrics || '📃 暂无歌词'
    }));

    res.json({ code: 200, message: 'success', total: payload.length, data: payload });
    log.ok(`搜索「${msg}」返回 ${payload.length} 条`);
  } catch (e) {
    log.error(`搜索接口异常：${e.message}`);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

/* ---------- 文档 ---------- */
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
  "msg": "关键词（必填）",
  "num": "返回条数(1-100, 默认30)",
  "quality": "音质(128/320/flac, 默认flac)"
}</code></pre>
  <h2>3. 调用示例</h2>
  <pre><code class="language-bash">curl "https://your-domain.vercel.app/search?msg=唯一&num=5"</code></pre>
  <h2>4. 返回示例</h2>
  <pre><code class="language-json">{
  "code": 200,
  "message": "success",
  "total": 5,
  "data": [
    {
      "id": 1,
      "title": "唯一",
      "singer": "王力宏",
      "duration": "4:22",
      "cover": "https://images.unsplash.com/...",
      "music_url": "https://xxx.kg.qq.com/...",
      "lyrics": "[00:00.00] 我的天空多么的清晰..."
    }
  ]
}</code></pre>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
</body>
</html>`);
});

/* ---------- 根路径 ---------- */
app.get('/', (_, res) => res.redirect('/docs'));

/* ---------- Serverless Export ---------- */
module.exports = app;
