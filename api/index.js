require('dotenv').config();
const express = require('express');
const axios = require('axios');
const chalk = require('chalk');
const Joi = require('joi');

const app = express();
const API = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.hhlqilongzhu.cn/'
};

const log = {
  info: (m) => console.log(chalk.cyan(`ℹ ${m}`)),
  ok: (m) => console.log(chalk.green(`✅ ${m}`)),
  warn: (m) => console.log(chalk.yellow(`⚠ ${m}`)),
  error: (m) => console.log(chalk.red(`❌ ${m}`))
};

// 验证参数
const searchSchema = Joi.object({
  msg: Joi.string().min(1).max(64).required(),
  num: Joi.number().integer().min(1).max(100).default(30),
  quality: Joi.string().valid('128', '320', 'flac', 'viper_atmos').default('flac')
});

// 获取歌曲详情函数
const fetchSongDetails = async (song, msg, quality) => {
  try {
    const params = {
      msg,
      n: song.n,
      type: 'json',
      quality
    };

    const { data } = await axios.get(API, {
      params,
      headers: HEADERS,
      timeout: 8000
    });

    // 处理不同结构的API响应
    const songData = Array.isArray(data) ? data[0] : data;
    return {
      id: song.n,
      title: song.title || '未知标题',
      singer: song.singer || '未知歌手',
      duration: song.Duration || '00:00',
      cover: songData.cover || songData.album_cover || '',
      music_url: songData.url || songData.music_url || '',
      lyrics: songData.lyrics || songData.song_lyrics || '📃 暂无歌词'
    };
  } catch (error) {
    log.warn(`获取歌曲详情失败 (n=${song.n}): ${error.message}`);
    return {
      id: song.n,
      title: song.title || '未知标题',
      singer: song.singer || '未知歌手',
      duration: song.Duration || '00:00',
      cover: '',
      music_url: '',
      lyrics: '📃 获取歌词失败'
    };
  }
};

// 主搜索接口
app.get('/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 验证参数
  const { error, value } = searchSchema.validate(req.query);
  if (error) {
    return res.status(400).json({ 
      code: 400, 
      message: error.details[0].message 
    });
  }

  try {
    const { msg, num, quality } = value;
    log.info(`搜索请求: ${msg} | 数量: ${num} | 音质: ${quality}`);

    // 第一步：获取歌曲列表
    const searchParams = { 
      msg, 
      n: '', 
      num, 
      type: 'json', 
      quality 
    };

    const { data } = await axios.get(API, {
      params: searchParams,
      headers: HEADERS,
      timeout: 10000
    });

    if (!Array.isArray(data?.data) || data.data.length === 0) {
      return res.status(404).json({ 
        code: 404, 
        message: '未找到相关歌曲' 
      });
    }

    log.info(`找到 ${data.data.length} 首歌曲，开始获取详情...`);

    // 第二步：并发获取每首歌的详情
    const detailRequests = data.data.map(song => 
      fetchSongDetails(song, msg, quality)
    );

    const songs = await Promise.all(detailRequests);
    const validSongs = songs.filter(song => song.music_url);

    log.ok(`返回 ${validSongs.length} 首有效歌曲`);

    res.json({
      code: 200,
      message: 'success',
      total: validSongs.length,
      data: validSongs
    });
  } catch (error) {
    log.error(`主接口错误: ${error.message}`);
    res.status(500).json({ 
      code: 500, 
      message: '服务器内部错误',
      error: error.message 
    });
  }
});

// 文档路由
app.get('/docs', (_, res) => {
  res.send(`
  <!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>🎵 酷狗音乐搜索 API 文档</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <!-- 代码高亮 -->
  <link rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css"/>
  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #ffffff;
      --surface: #f7f9fb;
      --primary: #2563eb;
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;
      background:var(--bg);
      color:var(--text);
      line-height:1.6;
      padding:2rem;
    }
    h1,h2{color:var(--primary)}
    h1{margin-bottom:1rem;font-size:2rem}
    h2{margin:2rem 0 .5rem;font-size:1.5rem}
    .endpoint{
      background:var(--surface);
      border-left:4px solid var(--primary);
      padding:.75rem 1rem;
      margin:.75rem 0;
      border-radius:.5rem;
      font-family:monospace;
      font-size:.9rem;
    }
    pre{
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:.5rem;
      padding:1rem;
      overflow-x:auto;
      font-size:.875rem;
    }
    .copy-btn{
      float:right;
      background:var(--primary);
      color:#fff;
      border:none;
      padding:.25rem .5rem;
      border-radius:.25rem;
      cursor:pointer;
      font-size:.75rem;
    }
    .copy-btn:hover{opacity:.9}
    table{border-collapse:collapse;width:100%;margin-top:.5rem}
    th,td{padding:.5rem;border-bottom:1px solid var(--border)}
    th{text-align:left;color:var(--muted)}
    footer{margin-top:3rem;font-size:.75rem;color:var(--muted)}
    @media(max-width:600px){
      body{padding:1rem}
      h1{font-size:1.6rem}
      pre{font-size:.8rem}
    }
  </style>
</head>
<body>

<h1>🎵 酷狗音乐搜索 API 文档</h1>
<p>简洁、免费、跨域可用的音乐搜索接口，基于龙珠源。</p>

<h2>1. 接口地址</h2>
<div class="endpoint">GET <b>/search</b></div>

<h2>2. 请求参数</h2>
<table>
  <tr><th>字段</th><th>类型</th><th>必填</th><th>默认值</th><th>说明</th></tr>
  <tr><td>msg</td><td>string</td><td>✅</td><td>-</td><td>关键词</td></tr>
  <tr><td>num</td><td>number</td><td>-</td><td>30</td><td>返回条数 (1-100)</td></tr>
  <tr><td>quality</td><td>string</td><td>-</td><td>flac</td><td>音质：128 / 320 / flac</td></tr>
</table>

<h2>3. 调用示例</h2>
<button class="copy-btn" data-clipboard-text="curl 'https://kugouapi.xtyun.click/search?msg=跳楼机&num=10&quality=flac'">复制</button>
<pre><code class="language-bash">curl 'https://kugouapi.xtyun.click/search?msg=跳楼机&num=10&quality=flac'</code></pre>

<h2>4. 返回示例</h2>
<button class="copy-btn" data-clipboard-text='{"code":200,"message":"success","total":2,"data":[{"id":1,"title":"跳楼机","singer":"LBI利比","duration":"3:21","cover":"...","music_url":"...","lyrics":"暂无"}]}'>复制</button>
<pre><code class="language-json">{
  "code": 200,
  "message": "success",
  "total": 2,
  "data": [
    {
      "id": 1,
      "title": "跳楼机",
      "singer": "LBI利比",
      "duration": "3:21",
      "cover": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=60",
      "music_url": "https://xxx.kg.qq.com/...",
      "lyrics": "暂无歌词"
    }
  ]
}</code></pre>

<h2>5. 错误码</h2>
<ul>
  <li><b>400</b> - 参数缺失 / 不合法</li>
  <li><b>404</b> - 无结果</li>
  <li><b>500</b> - 服务器内部错误</li>
</ul>

<h2>6. FAQ</h2>
<ul>
  <li><b>跨域？</b> 已自动开启 CORS。</li>
  <li><b>音乐无法播放？</b> 上游偶尔失效，可稍后重试。</li>
</ul>

<footer>
  &copy; 2024 KuGou API Team · 仅供学习交流
</footer>

<!-- 复制 & 高亮 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/2.0.11/clipboard.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
<script>new ClipboardJS('.copy-btn');</script>
</body>
</html>
  `);
});

// 根路径重定向到文档
app.get('/', (_, res) => res.redirect('/docs'));

// Vercel 支持
module.exports = app;
