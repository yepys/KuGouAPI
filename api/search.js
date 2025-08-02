// api/search.js
const axios = require('axios');

// 上游接口地址
const UPSTREAM = 'https://www.hhlqilongzhu.cn/api/dg_kugouSQ.php';

// 根据 n 获取详情
async function fetchDetail(msg, n, quality = '128') {
  const { data } = await axios.get(UPSTREAM, {
    params: { msg, n, quality, type: 'json' },
    timeout: 8000,
  });

  // 上游返回可能五花八门，这里简单容错
  if (!Array.isArray(data?.data)) return null;
  const item = data.data[0];
  return {
    cover: item.cover || '',
    music_url: item.music_url || '',
    lyrics: item.lyrics || '',
  };
}

module.exports = async (req, res) => {
  // 支持 GET / POST
  const { msg, quality = '128', num = 30 } = req.method === 'POST' ? req.body : req.query;

  if (!msg) {
    return res.status(400).json({ error: '缺少参数 msg' });
  }

  try {
    // 1. 先拿列表
    const listRes = await axios.get(UPSTREAM, {
      params: { msg, n: '', type: 'json', quality, num },
      timeout: 8000,
    });

    const list = listRes.data?.data || [];
    if (!list.length) {
      return res.json({ data: [] });
    }

    // 2. 并发拿详情
    const detailPromises = list.map(async (song) => {
      const detail = await fetchDetail(msg, song.n, quality);
      return {
        n: song.n,
        title: song.title,
        singer: song.singer,
        Duration: song.Duration,
        cover: detail?.cover || '',
        music_url: detail?.music_url || '',
        lyrics: detail?.lyrics || '',
      };
    });

    const data = await Promise.all(detailPromises);
    return res.json({ data });
  } catch (e) {
    console.error(e.message);
    return res.status(500).json({ error: '上游接口异常' });
  }
};
