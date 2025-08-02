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
  <html>
  <head>
    <title>🎵 API 文档</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #333; }
      .endpoint { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
      code { background: #eee; padding: 2px 5px; border-radius: 3px; }
    </style>
  </head>
  <body>
    <h1>🎵 酷狗音乐搜索 API</h1>
    
    <h2>搜索接口</h2>
    <div class="endpoint">
      <code>GET /search?msg={关键词}&num={数量}&quality={音质}</code>
      <p>示例: <a href="/search?msg=周杰伦&num=5" target="_blank">/search?msg=周杰伦&num=5</a></p>
    </div>
    
    <h2>参数说明</h2>
    <ul>
      <li><strong>msg</strong>: 搜索关键词 (必填)</li>
      <li><strong>num</strong>: 返回数量 (1-100, 默认30)</li>
      <li><strong>quality</strong>: 音质 (128/320/flac/viper_atmos, 默认flac)</li>
    </ul>
  </body>
  </html>
  `);
});

// 根路径重定向到文档
app.get('/', (_, res) => res.redirect('/docs'));

// Vercel 支持
module.exports = app;
