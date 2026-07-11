import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON(filename, defaultValue) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error reading ${filename}:`, e);
    return defaultValue;
  }
}

function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getUsers() { return readJSON('users.json', []); }
export function saveUsers(users) { writeJSON('users.json', users); }
export function saveUser(user) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) users[idx] = user;
  else users.push(user);
  saveUsers(users);
}

export function getPosts() { return readJSON('posts.json', []); }
export function savePosts(posts) { writeJSON('posts.json', posts); }

export function getComments() { return readJSON('comments.json', []); }
export function saveComments(comments) { writeJSON('comments.json', comments); }

export function getActivities() { return readJSON('activities.json', []); }
export function saveActivities(activities) { writeJSON('activities.json', activities); }

export function getNotifications() { return readJSON('notifications.json', []); }
export function saveNotifications(notifications) { writeJSON('notifications.json', notifications); }

export function getConversations() { return readJSON('conversations.json', []); }
export function saveConversations(conversations) { writeJSON('conversations.json', conversations); }

export function getMessages() { return readJSON('messages.json', []); }
export function saveMessages(messages) { writeJSON('messages.json', messages); }

export function getRedeemCodes() { return readJSON('redeem_codes.json', []); }
export function saveRedeemCodes(codes) { writeJSON('redeem_codes.json', codes); }

export function getRedeemRecords() { return readJSON('redeem_records.json', []); }
export function saveRedeemRecords(records) { writeJSON('redeem_records.json', records); }

export function getLikes() { return readJSON('likes.json', []); }
export function saveLikes(likes) { writeJSON('likes.json', likes); }

export function getCollects() { return readJSON('collects.json', []); }
export function saveCollects(collects) { writeJSON('collects.json', collects); }

export function getFollows() { return readJSON('follows.json', []); }
export function saveFollows(follows) { writeJSON('follows.json', follows); }

export function getBlacklists() { return readJSON('blacklists.json', []); }
export function saveBlacklist(entry) {
  const list = getBlacklists();
  list.push(entry);
  writeJSON('blacklists.json', list);
}
export function deleteBlacklist(userId, blockedUserId) {
  const list = getBlacklists().filter(b => !(b.userId === userId && b.blockedUserId === blockedUserId));
  writeJSON('blacklists.json', list);
}

export function getRegisterCount() {
  const meta = readJSON('meta.json', { registerCount: 0 });
  return meta.registerCount || 0;
}
export function incrementRegisterCount() {
  const count = getRegisterCount() + 1;
  writeJSON('meta.json', { registerCount: count });
  return count;
}

export function saveVerificationCode(vc) {
  const codes = readJSON('verification_codes.json', []);
  const filtered = codes.filter(c => !(c.phone === vc.phone && c.purpose === vc.purpose));
  filtered.push(vc);
  writeJSON('verification_codes.json', filtered);
}

export function findValidVerificationCode(phone, code, purpose) {
  const codes = readJSON('verification_codes.json', []);
  const now = Date.now();
  return codes.find(c => c.phone === phone && c.code === code && c.purpose === purpose && !c.used && c.expiresAt > now);
}

export function markVerificationCodeUsed(id) {
  const codes = readJSON('verification_codes.json', []);
  const vc = codes.find(c => c.id === id);
  if (vc) {
    vc.used = true;
    writeJSON('verification_codes.json', codes);
  }
}

export function findUserByPhone(phone) {
  const users = getUsers();
  return users.find(u => u.phone === phone) || null;
}

export function seedInitialData() {
  const activities = getActivities();
  if (activities.length === 0) {
    const now = Date.now();
    const seedActivities = [
      {
        id: 'act_1',
        title: '夏日生活记录',
        cover: 'https://picsum.photos/seed/act1/800/450',
        description: '分享你的夏日生活瞬间，带话题#夏日生活 发布帖子即可参与！',
        hashtag: '夏日生活',
        rewardCoins: 500,
        participantCount: 1234,
        participants: [],
        status: 'active',
        startDate: now - 86400000 * 3,
        endDate: now + 86400000 * 7,
        rules: [
          '带话题#夏日生活 发布原创帖子',
          '内容需与夏日生活相关',
          '活动结束后评选10名优质内容，每人获得500文书币'
        ]
      },
      {
        id: 'act_2',
        title: '日常打卡挑战',
        cover: 'https://picsum.photos/seed/act2/800/450',
        description: '连续7天发布日常帖子，坚持打卡赢取文书币奖励！',
        hashtag: '日常打卡',
        rewardCoins: 200,
        participantCount: 5678,
        participants: [],
        status: 'active',
        startDate: now - 86400000,
        endDate: now + 86400000 * 14,
        rules: [
          '带话题#日常打卡 连续7天发帖',
          '每天至少发布1篇帖子',
          '完成打卡即可获得200文书币'
        ]
      },
      {
        id: 'act_3',
        title: '读书分享月',
        cover: 'https://picsum.photos/seed/act3/800/450',
        description: '分享你最近在读的好书，带话题#读书分享 参与活动。',
        hashtag: '读书分享',
        rewardCoins: 300,
        participantCount: 892,
        participants: [],
        status: 'upcoming',
        startDate: now + 86400000 * 2,
        endDate: now + 86400000 * 30,
        rules: [
          '带话题#读书分享 发布读书笔记',
          '包含书籍封面照片更佳',
          '优质分享将获得300文书币奖励'
        ]
      },
      {
        id: 'act_4',
        title: '春季摄影大赛',
        cover: 'https://picsum.photos/seed/act4/800/450',
        description: '记录春天的美好瞬间，摄影作品征集活动已圆满结束。',
        hashtag: '春季摄影',
        rewardCoins: 800,
        participantCount: 3421,
        participants: [],
        status: 'ended',
        startDate: now - 86400000 * 30,
        endDate: now - 86400000 * 5,
        rules: [
          '带话题#春季摄影 发布摄影作品',
          '作品需为原创',
          '已评选出获奖名单'
        ]
      }
    ];
    saveActivities(seedActivities);
  }

  const redeemCodes = getRedeemCodes();
  const now = Date.now();
  const allCodes = [
    { code: 'WENSHU2024', coinValue: 200, rewardType: 'coin', description: '新用户欢迎礼包', validUntil: now + 86400000 * 365 },
    { code: 'QQGROUP702', coinValue: 300, rewardType: 'coin', description: '加入QQ群专属奖励', validUntil: now + 86400000 * 365 },
    { code: 'DAILYSIGN', coinValue: 50, rewardType: 'coin', description: '每日签到额外奖励', validUntil: now + 86400000 * 30 },
    { code: 'VIPWELCOME', coinValue: 500, rewardType: 'coin', description: '开通文书会奖励', validUntil: now + 86400000 * 365 },
    { code: 'SUMMER2024', coinValue: 100, rewardType: 'coin', description: '夏日活动兑换码', validUntil: now + 86400000 * 60 },
    { code: 'WELCOME100', coinValue: 100, rewardType: 'coin', description: '欢迎使用文书APP', validUntil: now + 86400000 * 365 },
    { code: 'A3k320', coinValue: 2000, rewardType: 'coin', description: '限时兑换码-2000文书币', validUntil: now + 86400000 * 90 },
    { code: '56gh70', coinValue: 1000, rewardType: 'coin', description: '限时兑换码-1000文书币', validUntil: now + 86400000 * 90 },
    { code: 'Kp9m2X', coinValue: 0, rewardType: 'vip', description: '免费开通文书会VIP', validUntil: now + 86400000 * 90 },
    { code: 'Qr4n7V', coinValue: 0, rewardType: 'vip', description: '免费开通文书会VIP', validUntil: now + 86400000 * 90 },
    { code: 'Zt8w3Y', coinValue: 0, rewardType: 'vip', description: '免费开通文书会VIP', validUntil: now + 86400000 * 90 },
  ];
  let codesUpdated = false;
  allCodes.forEach(c => {
    const existing = redeemCodes.find(r => r.code.toUpperCase() === c.code.toUpperCase());
    if (!existing) {
      redeemCodes.push({ ...c, code: c.code, usedBy: [] });
      codesUpdated = true;
    } else {
      existing.coinValue = c.coinValue;
      existing.rewardType = c.rewardType;
      existing.description = c.description;
      codesUpdated = true;
    }
  });
  if (codesUpdated) {
    saveRedeemCodes(redeemCodes);
  }

  const conversations = getConversations();
  if (conversations.length === 0) {
    saveConversations([]);
  }

  const users = getUsers();
  const posts = getPosts();
  if (users.length === 0 && posts.length === 0) {
    const genId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botNames = ['文书小助手', '生活记录者', '读书爱好者', '咖啡控', '摄影小白', '跑步达人', '美食猎人'];
    const botUsers = [];
    botNames.forEach((name, i) => {
      const color = ['000000', '333333', '555555', '1a1a1a', '2d2d2d', '4a4a4a', '666666'][i];
      const bot = {
        id: genId('bot'),
        username: name,
        password: 'bot123456',
        phone: null,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color}&color=fff&size=200&bold=true`,
        cover: `https://picsum.photos/seed/bot${i}/800/320`,
        bio: '我是机器人，分享美好生活~',
        wenshuCoin: Math.floor(Math.random() * 5000),
        isVip: name === '文书小助手',
        vipLevel: name === '文书小助手' ? 10 : 0,
        vipExp: 0,
        vipExpiresAt: null,
        followingCount: Math.floor(Math.random() * 100),
        followersCount: Math.floor(Math.random() * 2000),
        likesCount: Math.floor(Math.random() * 5000),
        registerRank: 0,
        isSignedInToday: false,
        lastSignInDate: '',
        consecutiveSignDays: Math.floor(Math.random() * 30),
        createdAt: Date.now() - Math.floor(Math.random() * 86400000 * 30),
        joinedQQGroup: Math.random() > 0.5
      };
      botUsers.push(bot);
    });
    users.push(...botUsers);
    saveUsers(users);

    const seedPosts = [
      { content: '今天天气真好，出门散步看到了很美的夕阳🌇 生活中的小确幸就是这样不期而遇～ #日常 #生活记录', images: ['https://picsum.photos/seed/p1/600/600'], tags: ['日常', '生活记录'] },
      { content: '分享一本最近在读的书《被讨厌的勇气》，非常推荐！里面的观点颠覆了我很多固有的思维方式。#读书分享 #推荐', images: ['https://picsum.photos/seed/p2/600/800', 'https://picsum.photos/seed/p2b/600/600'], tags: ['读书分享', '推荐'] },
      { content: '自己做的拿铁拉花，虽然不是很完美但是进步了！☕ 继续加油练习～ #咖啡 #日常打卡', images: ['https://picsum.photos/seed/p3/600/600'], tags: ['咖啡', '日常打卡'] },
      { content: '周末去了美术馆，看到了很多喜欢的作品。艺术真的能让人静下心来。#夏日生活 #艺术', images: ['https://picsum.photos/seed/p4/800/600', 'https://picsum.photos/seed/p4b/600/600', 'https://picsum.photos/seed/p4c/600/600'], tags: ['夏日生活', '艺术'] },
      { content: '新学会的一道菜——番茄炒蛋！看起来简单，做好吃还是需要技巧的😋 #美食 #日常', images: ['https://picsum.photos/seed/p5/600/600'], tags: ['美食', '日常'] },
      { content: '跑步第30天打卡！从一开始跑1公里都喘到现在能轻松跑5公里，坚持真的有意义💪 #日常打卡 #运动', images: [], tags: ['日常打卡', '运动'] },
      { content: '今天的云好美啊，像棉花糖一样☁️ 拍了好多张照片，每一张都像壁纸。#夏日生活 #摄影', images: ['https://picsum.photos/seed/p7/600/400', 'https://picsum.photos/seed/p7b/600/800'], tags: ['夏日生活', '摄影'] },
      { content: '深夜emo时间...有时候觉得努力了很久的事情却看不到结果，但还是要相信一切都是最好的安排吧。#日常 #心情', images: [], tags: ['日常', '心情'] },
      { content: '新买的文具到了！开箱的快乐谁懂啊✨ 这个本子的纸质超级好，写字好顺滑。#好物分享 #文具', images: ['https://picsum.photos/seed/p9/600/600', 'https://picsum.photos/seed/p9b/600/600'], tags: ['好物分享', '文具'] },
      { content: '城市夜景永远拍不腻🌃 站在天桥上看车水马龙，感觉自己很渺小但又充满可能性。#摄影 #城市', images: ['https://picsum.photos/seed/p10/800/600'], tags: ['摄影', '城市'] },
      { content: '夏天就是要吃西瓜🍉 冰镇西瓜配上空调，这才是夏天该有的样子！#夏日生活 #美食', images: ['https://picsum.photos/seed/p11/600/600'], tags: ['夏日生活', '美食'] },
      { content: '今天尝试了新的妆容，感觉自己美美哒💄 女孩子要学会爱自己~ #日常 #美妆', images: ['https://picsum.photos/seed/p12/600/700'], tags: ['日常', '美妆'] },
    ];

    seedPosts.forEach((seed, i) => {
      const author = botUsers[Math.floor(Math.random() * botUsers.length)];
      const likeCount = Math.floor(Math.random() * 200) + 10;
      const commentCount = Math.floor(Math.random() * 30);
      const collectCount = Math.floor(Math.random() * 50);
      posts.push({
        id: genId('post'),
        authorId: author.id,
        content: seed.content,
        images: seed.images,
        tags: seed.tags,
        likeCount,
        commentCount,
        collectCount,
        createdAt: Date.now() - i * 3600000 * (Math.random() * 4 + 1)
      });
    });
    savePosts(posts);
    console.log('🌱 初始种子数据已创建：', botUsers.length, '个机器人用户，', posts.length, '条帖子');
  }
}
