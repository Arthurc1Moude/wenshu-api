import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initDB,
  getUsers, saveUser, saveUsers,
  getPosts, savePost, savePosts,
  getComments, saveComment, saveComments,
  getLikes, addLike, removeLike,
  getCollects, addCollect, removeCollect,
  getFollows, addFollow, removeFollow,
  getBlacklists, addBlacklist, removeBlacklist,
  getActivities, saveActivity, saveActivities,
  getNotifications, addNotification, markNotificationsRead,
  getConversations, saveConversation, saveConversations,
  getMessages, saveMessage, markMessagesRead,
  getRedeemCodes, saveRedeemCode, saveRedeemCodes,
  getRedeemRecords, addRedeemRecord,
  getRegisterCount, incrementRegisterCount,
  seedInitialData,
  saveVerificationCode, findValidVerificationCode, markVerificationCodeUsed,
  findUserByPhone,
  getCommentLikes, addCommentLike, removeCommentLike, isCommentLikedByUser, getCommentLikeCount,
  getGroupChats, getGroupChatById, getGroupChatByNumber, saveGroupChat,
  getGroupMembers, getUserGroups, addGroupMember, removeGroupMember, isGroupMember, generateGroupNumber,
  getTips, addTip
} from './db.js';

import {
  getBooks, saveBook, deleteBook,
  getSecretPosts, saveSecretPost, deleteSecretPost,
  getSecretVisits, addSecretVisit,
  getMiniApps, saveMiniApp,
  getGames, saveGame
} from './features-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getUserId(req) {
  return req.headers.authorization?.replace('Bearer ', '') || null;
}

function getUserPublic(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  if (safe.isBanned && safe.banUntil && safe.banUntil < Date.now()) {
    return { ...safe, isBanned: false, banUntil: null, banReason: null };
  }
  return safe;
}

async function checkBanned(userId) {
  if (!userId) return null;
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { banned: true, reason: '用户不存在' };
  if (user.isBanned) {
    if (user.banUntil && user.banUntil < Date.now()) {
      user.isBanned = false;
      user.banUntil = null;
      user.banReason = null;
      await saveUser(user);
      return null;
    }
    return { banned: true, reason: user.banReason || '账号已被封禁' };
  }
  return null;
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function isBlocked(userId1, userId2) {
  if (!userId1 || !userId2) return false;
  const blacklists = await getBlacklists();
  return blacklists.some(b => 
    (b.userId === userId1 && b.blockedUserId === userId2) ||
    (b.userId === userId2 && b.blockedUserId === userId1)
  );
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: '密码长度至少8位' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: '密码需包含至少1个小写字母' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: '密码需包含至少1个大写字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码需包含至少1个数字' };
  }
  if (/[\u4e00-\u9fa5]/.test(password)) {
    return { valid: false, message: '密码不能包含中文字符' };
  }
  return { valid: true };
}

function validatePhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateUsernameSuggestions(baseUsername, existingUsers, count = 5) {
  const suggestions = [];
  const existingNames = new Set(existingUsers.map(u => u.username.toLowerCase()));
  
  const suffixes = [
    () => Math.floor(Math.random() * 100).toString(),
    () => Math.floor(Math.random() * 1000).toString(),
    () => ['_', '', '__'][Math.floor(Math.random() * 3)] + ['wenshu', 'shu', 'wen', 'reader', 'writer', 'life', 'note'][Math.floor(Math.random() * 7)],
    () => ['2024', '2025', '666', '888', '999', '00', '01'][Math.floor(Math.random() * 7)],
    () => ['_official', '_real', '_v', '__v2', '_home', '_zone'][Math.floor(Math.random() * 6)],
  ];
  
  const prefixes = ['', 'the', 'real', 'im', 'mr', 'ms', ''];
  
  let attempts = 0;
  while (suggestions.length < count && attempts < 50) {
    attempts++;
    let candidate;
    if (suggestions.length < 2) {
      const suffix = suffixes[suggestions.length]();
      candidate = baseUsername + suffix;
    } else {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]();
      candidate = prefix + baseUsername + suffix;
    }
    candidate = candidate.toLowerCase().replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
    if (candidate.length < 2) continue;
    if (!existingNames.has(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
  }
  
  while (suggestions.length < count) {
    const num = Math.floor(Math.random() * 10000);
    const candidate = `${baseUsername}${num}`;
    if (!existingNames.has(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
  }
  
  return suggestions.slice(0, count);
}

function decoratePost(post, currentUserId, users, likes, collects, tips) {
  const author = users.find(u => u.id === post.authorId);
  const postTips = tips ? tips.filter(t => t.postId === post.id) : [];
  const coinCount = post.coinCount != null ? post.coinCount : postTips.reduce((sum, t) => sum + (t.amount || 0), 0);
  const tippedBy = post.tippedBy || (tips ? tips.filter(t => t.postId === post.id).map(t => t.userId) : []);
  const isTipped = currentUserId ? (tippedBy.includes(currentUserId) || (tips ? tips.some(t => t.postId === post.id && t.userId === currentUserId) : false)) : false;
  return {
    ...post,
    coinCount,
    author: author ? getUserPublic(author) : null,
    isLiked: currentUserId ? likes.some(l => l.postId === post.id && l.userId === currentUserId) : false,
    isCollected: currentUserId ? collects.some(c => c.postId === post.id && c.userId === currentUserId) : false,
    isTipped,
  };
}

async function createNotification(userId, type, content, fromUserId, postId) {
  const users = await getUsers();
  const fromUser = fromUserId ? users.find(u => u.id === fromUserId) : null;
  const notif = {
    id: genId('notif'),
    userId,
    type,
    fromUserId: fromUserId || null,
    fromUser: fromUser ? { id: fromUser.id, username: fromUser.username, avatar: fromUser.avatar, isVip: fromUser.isVip, vipLevel: fromUser.vipLevel } : null,
    postId: postId || null,
    content,
    isRead: false,
    createdAt: Date.now()
  };
  await addNotification(notif);
  return notif;
}

async function addCoins(userId, amount, reason) {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  user.wenshuCoin = (user.wenshuCoin || 0) + amount;
  await saveUser(user);
  await createNotification(userId, 'system', `获得${amount}文书币：${reason}`, null, null);
  return user;
}

async function addVipExp(userId, amount) {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  if (!user || !user.isVip) return null;
  user.vipExp = (user.vipExp || 0) + amount;
  let nextLevelExp = user.vipLevel * 100;
  while (user.vipExp >= nextLevelExp && user.vipLevel < 100) {
    user.vipLevel += 1;
    user.vipExp -= nextLevelExp;
    nextLevelExp = user.vipLevel * 100;
    await createNotification(userId, 'system', `恭喜！文书会等级提升至 Lv${user.vipLevel}！`, null, null);
  }
  await saveUser(user);
  return user;
}

async function createWelcomeConversation(userId) {
  const officialConv = {
    id: genId('conv'),
    type: 'private',
    name: '文书小助手',
    avatar: null,
    participantIds: [userId, 'system_assistant'],
    lastMessage: '欢迎来到文书APP！',
    lastMessageTime: Date.now(),
    unreadCount: 1,
    isSystem: true,
  };
  await saveConversation(officialConv);

  const welcomeMsgs = [
    '欢迎来到文书APP！🎉',
    '这里是一个记录生活、分享美好的社区。',
    '你可以：每日签到获得文书币、参与活动赢取奖励、加入文书会享受特权。',
    '加入官方QQ群(702404026)可以领取300文书币，并参与定时抢兑换码活动哦！',
    '快去发布你的第一篇帖子吧~✨',
  ];
  let msgTime = Date.now() - welcomeMsgs.length * 60000;
  for (const content of welcomeMsgs) {
    await saveMessage({
      id: genId('msg'),
      conversationId: officialConv.id,
      senderId: 'system_assistant',
      content,
      createdAt: msgTime,
      read: false,
    });
    msgTime += 60000;
  }
}

// ========== AUTH MIDDLEWARE ==========
const auth = async (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.userId = userId;
  next();
};

const authOptional = async (req, res, next) => {
  const userId = getUserId(req);
  if (userId) {
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (user) req.userId = userId;
  }
  next();
};

// ========== AUTH ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
    
    const pwdValidation = validatePassword(password);
    if (!pwdValidation.valid) {
      return res.status(400).json({ error: pwdValidation.message });
    }
    
    if (phone && !validatePhone(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }
    
    const users = await getUsers();
    if (users.find(u => u.username === username)) {
      const suggestions = generateUsernameSuggestions(username, users);
      return res.status(409).json({ 
        error: '该用户名已被注册，建议直接登录或选择其他用户名', 
        code: 'USERNAME_TAKEN',
        suggestions 
      });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(409).json({ 
        error: '该手机号已注册账号，建议直接登录', 
        code: 'PHONE_TAKEN' 
      });
    }

    const rank = await incrementRegisterCount();
    let bonusCoins = 0;
    if (rank <= 5) bonusCoins = 100000;
    else if (rank <= 10) bonusCoins = 50000;
    else if (rank <= 15) bonusCoins = 10000;

    const avatarColors = ['000000', '333333', '555555', '1a1a1a', '2d2d2d'];
    const color = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${color}&color=fff&size=200&bold=true`;

    const user = {
      id: genId('user'),
      username,
      password,
      phone: phone || null,
      avatar,
      cover: `https://picsum.photos/seed/cover${rank}/800/320`,
      bio: '这个人很懒，什么都没写~',
      location: '',
      wenshuCoin: bonusCoins,
      isVip: false,
      vipLevel: 0,
      vipExp: 0,
      vipExpiresAt: null,
      followingCount: 0,
      followersCount: 0,
      likesCount: 0,
      registerRank: rank,
      isSignedInToday: false,
      lastSignInDate: '',
      consecutiveSignDays: 0,
      createdAt: Date.now(),
      joinedQQGroup: false
    };
    await saveUser(user);
    await createWelcomeConversation(user.id);

    if (bonusCoins > 0) {
      await createNotification(user.id, 'system', `恭喜！作为第${rank}位注册用户，您获得了${bonusCoins}文书币奖励！`, null, null);
    }
    await createNotification(user.id, 'system', '欢迎加入文书APP！记得每日签到领取文书币哦~', null, null);

    res.json({ user: getUserPublic(user), token: user.id });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: '用户名或密码错误' });

    const today = getTodayStr();
    user.isSignedInToday = (user.lastSignInDate === today);
    await saveUser(user);

    res.json({ user: getUserPublic(user), token: user.id });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '用户不存在' });

    const today = getTodayStr();
    user.isSignedInToday = (user.lastSignInDate === today);
    await saveUser(user);

    res.json(getUserPublic(user));
  } catch (e) {
    console.error('Get me error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.put('/api/users/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(401).json({ error: '未登录' });
    const { username, bio, avatar, cover, location } = req.body;
    if (username) users[idx].username = username;
    if (bio !== undefined) users[idx].bio = bio;
    if (avatar) users[idx].avatar = avatar;
    if (cover) users[idx].cover = cover;
    if (location !== undefined) users[idx].location = location;
    await saveUser(users[idx]);
    res.json(getUserPublic(users[idx]));
  } catch (e) {
    console.error('Update profile error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const currentUserId = getUserId(req);
    const users = await getUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    const follows = await getFollows();
    let isFollowing = false;
    let isMutual = false;
    
    if (currentUserId) {
      isFollowing = follows.some(f => f.followerId === currentUserId && f.followingId === user.id);
      const isFollowedBy = follows.some(f => f.followerId === user.id && f.followingId === currentUserId);
      isMutual = isFollowing && isFollowedBy;
    }
    
    res.json({
      ...getUserPublic(user),
      isFollowing,
      isMutual
    });
  } catch (e) {
    console.error('Get user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== SIGN IN ==========
app.post('/api/coin/signin', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const banCheck = await checkBanned(userId);
    if (banCheck) return res.status(403).json({ error: banCheck.reason });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });

    const today = getTodayStr();
    if (user.lastSignInDate === today) {
      return res.status(400).json({ error: '今日已签到' });
    }

    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
    if (user.lastSignInDate === yesterdayStr) {
      user.consecutiveSignDays = (user.consecutiveSignDays || 0) + 1;
    } else {
      user.consecutiveSignDays = 1;
    }

    const cycleDay = ((user.consecutiveSignDays - 1) % 7) + 1;
    let coinsReward = 0;
    let vipDays = 0;
    let rewardDesc = '';
    const randomGifts = [
      { coins: 30, desc: '30文书币' },
      { coins: 50, desc: '50文书币' },
      { coins: 40, desc: '40文书币' },
      { coins: 88, desc: '88文书币（好运奖励）' },
      { coins: 66, desc: '66文书币（六六大顺）' },
    ];
    switch (cycleDay) {
      case 1: coinsReward = 10; rewardDesc = '10文书币'; break;
      case 2: coinsReward = 20; rewardDesc = '20文书币'; break;
      case 3:
      case 4:
      case 5:
      case 6: {
        const gift = randomGifts[Math.floor(Math.random() * randomGifts.length)];
        coinsReward = gift.coins;
        rewardDesc = gift.desc;
        break;
      }
      case 7:
        coinsReward = 50;
        vipDays = 7;
        rewardDesc = '50文书币 + 7天免费VIP体验';
        if (user.isVip) {
          user.vipExpiresAt = (user.vipExpiresAt || Date.now()) + vipDays * 86400000;
        } else {
          user.isVip = true;
          user.vipLevel = 1;
          user.vipExp = 0;
          user.vipExpiresAt = Date.now() + vipDays * 86400000;
        }
        user.consecutiveSignDays = 0;
        break;
    }

    user.wenshuCoin = (user.wenshuCoin || 0) + coinsReward;
    user.lastSignInDate = today;
    user.isSignedInToday = true;
    await saveUser(user);

    await addVipExp(userId, 10);
    await createNotification(user.id, 'signin', `签到成功（第${cycleDay}天）！获得${rewardDesc}`, null, null);

    res.json({
      coins: coinsReward,
      vipDays,
      consecutiveDays: user.consecutiveSignDays,
      cycleDay,
      rewardDesc,
      totalCoins: user.wenshuCoin,
      isVip: user.isVip,
      vipExpiresAt: user.vipExpiresAt
    });
  } catch (e) {
    console.error('Sign in error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/coin/join-qq', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });
    if (user.joinedQQGroup) return res.status(400).json({ error: '已领取过QQ群奖励' });
    user.joinedQQGroup = true;
    user.wenshuCoin += 200;
    await saveUser(user);
    await createNotification(user.id, 'system', '加入QQ群奖励：获得200文书币！QQ群号：702404026', null, null);
    res.json({ coins: 200, totalCoins: user.wenshuCoin });
  } catch (e) {
    console.error('Join QQ error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== VIP ==========
app.post('/api/vip/purchase', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });
    if (user.isVip) return res.status(400).json({ error: '已是文书会会员' });

    user.isVip = true;
    user.vipLevel = 1;
    user.vipExp = 0;
    user.vipExpiresAt = Date.now() + 365 * 24 * 3600 * 1000;
    user.wenshuCoin += 500;
    await saveUser(user);

    await createNotification(user.id, 'vip', '欢迎加入文书会！获得500文书币开通奖励，开始享受会员特权吧！', null, null);
    res.json({ user: getUserPublic(user) });
  } catch (e) {
    console.error('VIP purchase error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== REDEEM CODE ==========
app.post('/api/redeem', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { code } = req.body;
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });

    const codes = await getRedeemCodes();
    const redeemCode = codes.find(c => c.code.toUpperCase() === code.toUpperCase());
    if (!redeemCode) return res.status(400).json({ error: '兑换码无效或已过期' });
    if (redeemCode.validUntil < Date.now()) return res.status(400).json({ error: '兑换码无效或已过期' });
    if (!redeemCode.usedBy) redeemCode.usedBy = [];
    if (redeemCode.usedBy.includes(user.id)) return res.status(400).json({ error: '已使用过此兑换码' });

    redeemCode.usedBy.push(user.id);
    await saveRedeemCode(redeemCode);

    let responseData = { coins: 0, vipGranted: false, description: redeemCode.description, totalCoins: user.wenshuCoin };

    if (redeemCode.rewardType === 'vip') {
      if (user.isVip) {
        user.vipExpiresAt = (user.vipExpiresAt || Date.now()) + 365 * 24 * 3600 * 1000;
      } else {
        user.isVip = true;
        user.vipLevel = 1;
        user.vipExp = 0;
        user.vipExpiresAt = Date.now() + 365 * 24 * 3600 * 1000;
      }
      responseData.vipGranted = true;
      responseData.vipExpiresAt = user.vipExpiresAt;
      await addRedeemRecord({
        id: genId('rec'),
        userId: user.id,
        code: redeemCode.code,
        coinValue: 0,
        rewardType: 'vip',
        redeemedAt: Date.now()
      });
      await createNotification(user.id, 'vip', '🎉 兑换成功！文书会VIP已激活，开始享受会员特权吧！', null, null);
    } else {
      user.wenshuCoin += redeemCode.coinValue;
      responseData.coins = redeemCode.coinValue;
      responseData.totalCoins = user.wenshuCoin;
      await addRedeemRecord({
        id: genId('rec'),
        userId: user.id,
        code: redeemCode.code,
        coinValue: redeemCode.coinValue,
        rewardType: 'coin',
        redeemedAt: Date.now()
      });
      await createNotification(user.id, 'redeem_success', `兑换成功！获得${redeemCode.coinValue}文书币（${redeemCode.description}）`, null, null);
    }

    await saveUser(user);
    res.json(responseData);
  } catch (e) {
    console.error('Redeem error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/redeem/records', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json([]);
    const records = await getRedeemRecords();
    res.json(records.filter(r => r.userId === userId));
  } catch (e) {
    console.error('Get redeem records error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== POSTS ==========
app.get('/api/posts', async (req, res) => {
  try {
    const { sort = 'new', tag, userId } = req.query;
    const currentUserId = getUserId(req);
    let posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const collects = await getCollects();
    const blacklists = await getBlacklists();
    const tipsList = getTips();

    if (currentUserId) {
      const blockedUserIds = blacklists.filter(b => b.userId === currentUserId).map(b => b.blockedUserId);
      posts = posts.filter(p => !blockedUserIds.includes(p.authorId));
    }

    if (tag) posts = posts.filter(p => p.tags.some(t => t.includes(tag)));
    if (userId) posts = posts.filter(p => p.authorId === userId);

    if (sort === 'hot') {
      posts = [...posts].sort((a, b) => (b.likeCount * 3 + b.commentCount * 2 + b.collectCount + b.coinCount * 5) - (a.likeCount * 3 + a.commentCount * 2 + a.collectCount + a.coinCount * 5));
    } else {
      posts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
    }

    res.json(posts.map(p => decoratePost(p, currentUserId, users, likes, collects, tipsList)));
  } catch (e) {
    console.error('Get posts error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const currentUserId = getUserId(req);
    const posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const collects = await getCollects();
    const tipsList = getTips();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    res.json(decoratePost(post, currentUserId, users, likes, collects, tipsList));
  } catch (e) {
    console.error('Get post error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });
    const { content, images, tags, title } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

    const post = {
      id: genId('post'),
      authorId: userId,
      title: title || '',
      content: content.trim(),
      images: images || [],
      tags: tags || [],
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      coinCount: 0,
      tippedBy: [],
      createdAt: Date.now()
    };
    await savePost(post);
    await addVipExp(userId, 20);

    if (tags && tags.length > 0) {
      const activities = await getActivities();
      let activitiesChanged = false;
      tags.forEach(tag => {
        const activity = activities.find(a => a.hashtag === tag && a.status === 'active');
        if (activity && !activity.participants.includes(userId)) {
          activity.participantCount++;
          activity.participants.push(userId);
          activitiesChanged = true;
        }
      });
      if (activitiesChanged) {
        for (const a of activities) await saveActivity(a);
      }
    }

    res.json({
      ...post,
      author: getUserPublic(user),
      isLiked: false,
      isCollected: false,
      isTipped: false,
    });
  } catch (e) {
    console.error('Create post error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });

    const post = posts[idx];
    const existing = likes.findIndex(l => l.postId === post.id && l.userId === userId);
    let isLiked;
    if (existing !== -1) {
      post.likeCount--;
      await removeLike(post.id, userId);
      isLiked = false;
    } else {
      post.likeCount++;
      await addLike({ id: genId('like'), postId: post.id, userId, createdAt: Date.now() });
      const author = users.find(u => u.id === post.authorId);
      if (author) {
        author.likesCount++;
        await saveUser(author);
      }
      if (post.authorId !== userId) {
        await createNotification(post.authorId, 'like', '赞了你的帖子', userId, post.id);
      }
      await addVipExp(userId, 1);
      isLiked = true;
    }
    await savePost(post);
    res.json({ likeCount: post.likeCount, isLiked });
  } catch (e) {
    console.error('Like error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/posts/:id/collect', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const posts = await getPosts();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
    const post = posts[idx];
    const collects = await getCollects();
    const existing = collects.findIndex(c => c.postId === post.id && c.userId === userId);
    let isCollected;
    if (existing !== -1) {
      post.collectCount--;
      await removeCollect(post.id, userId);
      isCollected = false;
    } else {
      post.collectCount++;
      await addCollect({ id: genId('collect'), postId: post.id, userId, createdAt: Date.now() });
      isCollected = true;
    }
    await savePost(post);
    res.json({ collectCount: post.collectCount, isCollected });
  } catch (e) {
    console.error('Collect error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== TIP / 投币 ==========
app.post('/api/posts/:id/tip', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const banCheck = await checkBanned(userId);
    if (banCheck) return res.status(403).json({ error: banCheck.reason });
    const users = await getUsers();
    const me = users.find(u => u.id === userId);
    if (!me) return res.status(401).json({ error: '未登录' });
    const posts = await getPosts();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
    const post = posts[idx];
    if (post.authorId === userId) return res.status(400).json({ error: '不能给自己的帖子投币' });

    const amount = req.body?.amount && Number.isInteger(req.body.amount) && req.body.amount > 0 ? req.body.amount : 10;
    if (amount < 1) return res.status(400).json({ error: '投币数量至少为1' });
    if ((me.wenshuCoin || 0) < amount) {
      return res.status(400).json({ error: '文书币不足', code: 'INSUFFICIENT_COINS' });
    }

    me.wenshuCoin = (me.wenshuCoin || 0) - amount;
    await saveUser(me);

    const author = users.find(u => u.id === post.authorId);
    if (author) {
      author.wenshuCoin = (author.wenshuCoin || 0) + amount;
      await saveUser(author);
    }

    post.coinCount = (post.coinCount || 0) + amount;
    if (!post.tippedBy) post.tippedBy = [];
    if (!post.tippedBy.includes(userId)) post.tippedBy.push(userId);
    await savePost(post);

    addTip({ id: genId('tip'), postId: post.id, userId, amount, createdAt: Date.now() });

    if (author && post.authorId !== userId) {
      await createNotification(post.authorId, 'tip', `向你的帖子投入了${amount}文书币`, userId, post.id);
    }

    await addVipExp(userId, Math.max(1, Math.floor(amount / 10)));

    const isTipped = (post.tippedBy || []).includes(userId);
    res.json({ coinCount: post.coinCount, isTipped, amount, totalCoins: me.wenshuCoin });
  } catch (e) {
    console.error('Tip error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== SHARE LINKS ==========
app.get('/api/share/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === 'post') {
      const posts = await getPosts();
      const post = posts.find(p => p.id === id);
      if (!post) return res.status(404).json({ error: '帖子不存在' });
      const users = await getUsers();
      const author = users.find(u => u.id === post.authorId);
      return res.json({ type: 'post', id, post, author: author ? getUserPublic(author) : null, shareUrl: `wenshu://post/${id}` });
    }
    if (type === 'user') {
      const users = await getUsers();
      const user = users.find(u => u.id === id);
      if (!user) return res.status(404).json({ error: '用户不存在' });
      return res.json({ type: 'user', id, user: getUserPublic(user), shareUrl: `wenshu://user/${id}` });
    }
    res.status(400).json({ error: '无效的分享类型' });
  } catch (e) {
    console.error('Share error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== COMMENTS ==========
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const currentUserId = getUserId(req);
    const comments = await getComments();
    const users = await getUsers();
    const postComments = comments.filter(c => c.postId === req.params.id).sort((a, b) => a.createdAt - b.createdAt);
    const result = [];
    for (const c of postComments) {
      const author = users.find(u => u.id === c.authorId);
      const replyToUser = c.replyToId ? users.find(u => u.id === c.replyToId) : null;
      const isLiked = currentUserId ? await isCommentLikedByUser(c.id, currentUserId) : false;
      const likeCount = await getCommentLikeCount(c.id);
      result.push({
        ...c,
        likeCount,
        isLiked,
        author: author ? getUserPublic(author) : null,
        replyToUser: replyToUser ? { id: replyToUser.id, username: replyToUser.username } : null
      });
    }
    res.json(result);
  } catch (e) {
    console.error('Get comments error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: '未登录' });
    const { content, replyToId } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });

    const posts = await getPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const comment = {
      id: genId('comment'),
      postId: req.params.id,
      authorId: userId,
      content: content.trim(),
      likeCount: 0,
      isLiked: false,
      createdAt: Date.now(),
      replyToId: replyToId || null
    };
    await saveComment(comment);
    post.commentCount++;
    await savePost(post);

    await addVipExp(userId, 5);

    if (post.authorId !== userId) {
      const replyToUser = replyToId ? users.find(u => u.id === replyToId) : null;
      const notifContent = replyToUser ? `回复了你的评论：${content.slice(0, 20)}` : `评论了你的帖子：${content.slice(0, 20)}`;
      const notifyUserId = replyToId || post.authorId;
      await createNotification(notifyUserId, 'comment', notifContent, userId, post.id);
    }

    const replyToUser = replyToId ? users.find(u => u.id === replyToId) : null;
    res.json({
      ...comment,
      author: getUserPublic(user),
      replyToUser: replyToUser ? { id: replyToUser.id, username: replyToUser.username } : null,
    });
  } catch (e) {
    console.error('Create comment error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/comments/:id/like', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const banCheck = await checkBanned(userId);
    if (banCheck) return res.status(403).json({ error: banCheck.reason });
    const comments = await getComments();
    const idx = comments.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '评论不存在' });
    const comment = comments[idx];
    const alreadyLiked = await isCommentLikedByUser(comment.id, userId);
    let isLiked = false;
    if (alreadyLiked) {
      await removeCommentLike(comment.id, userId);
      comment.likeCount = Math.max(0, (comment.likeCount || 0) - 1);
    } else {
      await addCommentLike({ id: genId('clike'), commentId: comment.id, userId, createdAt: Date.now() });
      comment.likeCount = (comment.likeCount || 0) + 1;
      isLiked = true;
      if (comment.authorId !== userId) {
        await createNotification(comment.authorId, 'comment_like', '赞了你的评论', userId, comment.postId);
      }
      await addVipExp(userId, 1);
    }
    await saveComment(comment);
    const likeCount = await getCommentLikeCount(comment.id);
    res.json({ likeCount, isLiked });
  } catch (e) {
    console.error('Comment like error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== ACTIVITIES ==========
app.get('/api/activities', async (req, res) => {
  try {
    const { status } = req.query;
    let activities = await getActivities();
    if (status && status !== 'all') {
      activities = activities.filter(a => a.status === status);
    }
    res.json(activities);
  } catch (e) {
    console.error('Get activities error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/activities/:id', async (req, res) => {
  try {
    const activities = await getActivities();
    const activity = activities.find(a => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: '活动不存在' });
    res.json(activity);
  } catch (e) {
    console.error('Get activity error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/activities/:id/join', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const activities = await getActivities();
    const idx = activities.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '活动不存在' });
    const act = activities[idx];
    if (!act.participants) act.participants = [];
    if (!act.participants.includes(userId)) {
      act.participantCount++;
      act.participants.push(userId);
      await saveActivity(act);
    }
    res.json({ activity: act, hashtag: act.hashtag });
  } catch (e) {
    console.error('Join activity error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ notifications: [], unreadCount: 0 });
    const notifications = await getNotifications();
    const userNotifs = notifications.filter(n => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
    const unreadCount = userNotifs.filter(n => !n.isRead).length;
    res.json({ notifications: userNotifs, unreadCount });
  } catch (e) {
    console.error('Get notifications error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ ok: true });
    await markNotificationsRead(userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Mark notifications read error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== CONVERSATIONS / MESSAGES ==========
app.get('/api/conversations', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json([]);
    const conversations = await getConversations();
    const messages = await getMessages();
    const users = await getUsers();

    const myConvs = conversations.filter(c => c.participantIds.includes(userId) || c.isSystem);
    const result = myConvs.map(c => {
      const convMessages = messages.filter(m => m.conversationId === c.id);
      const lastMsg = convMessages.length > 0 ? convMessages[convMessages.length - 1] : null;
      const otherId = c.participantIds.find(id => id !== userId);
      let otherUser = null;
      if (c.isSystem) {
        otherUser = { id: 'system_assistant', username: '文书小助手', avatar: null, isVip: false, vipLevel: 0 };
      } else if (otherId) {
        const u = users.find(u => u.id === otherId);
        if (u) otherUser = { id: u.id, username: u.username, avatar: u.avatar, isVip: u.isVip, vipLevel: u.vipLevel };
      }
      return {
        ...c,
        otherUser,
        lastMessage: lastMsg ? lastMsg.content : c.lastMessage,
        lastMessageAt: lastMsg ? lastMsg.createdAt : c.lastMessageTime,
        unreadCount: convMessages.filter(m => m.senderId !== userId && !m.read).length,
      };
    }).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    res.json(result);
  } catch (e) {
    console.error('Get conversations error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const messages = await getMessages();
    const users = await getUsers();
    const convMessages = messages.filter(m => m.conversationId === req.params.id).sort((a, b) => a.createdAt - b.createdAt);
    const result = convMessages.map(m => {
      let sender = null;
      if (m.senderId === 'system_assistant') {
        sender = { id: 'system_assistant', username: '文书小助手', avatar: null };
      } else {
        const u = users.find(u => u.id === m.senderId);
        if (u) sender = { id: u.id, username: u.username, avatar: u.avatar, isVip: u.isVip, vipLevel: u.vipLevel };
      }
      return {
        ...m,
        senderName: sender?.username,
        senderAvatar: sender?.avatar,
        sender,
      };
    });
    await markMessagesRead(req.params.id, userId);
    res.json(result);
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '消息不能为空' });
    const users = await getUsers();
    const sender = users.find(u => u.id === userId);
    const convs = await getConversations();
    const conv = convs.find(c => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: '会话不存在' });

    const msg = {
      id: genId('msg'),
      conversationId: req.params.id,
      senderId: userId,
      content: content.trim(),
      createdAt: Date.now(),
      read: false
    };
    await saveMessage(msg);
    conv.lastMessage = content.trim();
    conv.lastMessageTime = Date.now();
    await saveConversation(conv);
    res.json({
      ...msg,
      senderName: sender?.username,
      senderAvatar: sender?.avatar,
      sender: sender ? getUserPublic(sender) : null,
    });
  } catch (e) {
    console.error('Send message error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/conversations/private/:userId', async (req, res) => {
  try {
    const currentId = getUserId(req);
    if (!currentId) return res.status(401).json({ error: '未登录' });
    const targetUserId = req.params.userId;
    const blocked = await isBlocked(currentId, targetUserId);
    if (blocked) return res.status(400).json({ error: '无法与该用户聊天' });
    const conversations = await getConversations();
    const existing = conversations.find(c => c.type === 'private' && c.participantIds.includes(currentId) && c.participantIds.includes(targetUserId));
    if (existing) return res.json(existing);
    const users = await getUsers();
    const targetUser = users.find(u => u.id === targetUserId);
    const conv = {
      id: genId('conv'),
      type: 'private',
      name: targetUser?.username || '聊天',
      avatar: targetUser?.avatar,
      participantIds: [currentId, targetUserId],
      lastMessage: '',
      lastMessageTime: Date.now(),
      unreadCount: 0
    };
    await saveConversation(conv);
    res.json(conv);
  } catch (e) {
    console.error('Create private conv error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/conversations/:id/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ ok: true });
    await markMessagesRead(req.params.id, userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Mark conv read error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== LIKED / SAVED POSTS ==========
app.get('/api/posts/liked/mine', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const collects = await getCollects();
    const tipsList = getTips();
    const myLikes = likes.filter(l => l.userId === userId).map(l => l.postId);
    const likedPosts = posts.filter(p => myLikes.includes(p.id)).sort((a, b) => b.createdAt - a.createdAt);
    res.json(likedPosts.map(p => decoratePost(p, userId, users, likes, collects, tipsList)));
  } catch (e) {
    console.error('Get liked posts error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/posts/saved/mine', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const collects = await getCollects();
    const tipsList = getTips();
    const myCollects = collects.filter(c => c.userId === userId).map(c => c.postId);
    const savedPosts = posts.filter(p => myCollects.includes(p.id)).sort((a, b) => b.createdAt - a.createdAt);
    res.json(savedPosts.map(p => decoratePost(p, userId, users, likes, collects, tipsList)));
  } catch (e) {
    console.error('Get saved posts error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== FOLLOW ==========
app.post('/api/users/:id/follow', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = await getUsers();
    const me = users.find(u => u.id === userId);
    const targetId = req.params.id;
    const target = users.find(u => u.id === targetId);
    if (!me || !target) return res.status(404).json({ error: '用户不存在' });
    if (userId === targetId) return res.status(400).json({ error: '不能关注自己' });

    const blocked = await isBlocked(userId, targetId);
    if (blocked) return res.status(400).json({ error: '无法关注该用户' });

    const follows = await getFollows();
    const existing = follows.findIndex(f => f.followerId === userId && f.followingId === targetId);
    let isFollowing = false;
    let isMutual = false;
    if (existing !== -1) {
      await removeFollow(userId, targetId);
      me.followingCount = Math.max(0, me.followingCount - 1);
      target.followersCount = Math.max(0, target.followersCount - 1);
    } else {
      await addFollow({ id: genId('follow'), followerId: userId, followingId: targetId, createdAt: Date.now() });
      me.followingCount++;
      target.followersCount++;
      isFollowing = true;
      await createNotification(target.id, 'follow', '关注了你', userId, null);
    }
    await saveUser(me);
    await saveUser(target);
    
    const updatedFollows = await getFollows();
    const targetFollowsMe = updatedFollows.some(f => f.followerId === targetId && f.followingId === userId);
    isMutual = isFollowing && targetFollowsMe;
    
    res.json({ isFollowing, isMutual, followingCount: me.followingCount, followersCount: target.followersCount });
  } catch (e) {
    console.error('Follow error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/:id/follow-status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ isFollowing: false });
    const targetId = req.params.id;
    const follows = await getFollows();
    const isFollowing = follows.some(f => f.followerId === userId && f.followingId === targetId);
    res.json({ isFollowing });
  } catch (e) {
    console.error('Follow status error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== BLACKLIST ==========
app.post('/api/users/:id/block', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const targetId = req.params.id;
    if (userId === targetId) return res.status(400).json({ error: '不能拉黑自己' });
    const users = await getUsers();
    const target = users.find(u => u.id === targetId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    const blacklists = await getBlacklists();
    const existing = blacklists.find(b => b.userId === userId && b.blockedUserId === targetId);
    if (existing) return res.json({ blocked: true });
    
    await addBlacklist({ id: genId('bl'), userId, blockedUserId: targetId, createdAt: Date.now() });
    
    const follows = await getFollows();
    const follow1 = follows.find(f => f.followerId === userId && f.followingId === targetId);
    const follow2 = follows.find(f => f.followerId === targetId && f.followingId === userId);
    const me = users.find(u => u.id === userId);
    if (follow1) {
      await removeFollow(userId, targetId);
      me.followingCount = Math.max(0, me.followingCount - 1);
      target.followersCount = Math.max(0, target.followersCount - 1);
    }
    if (follow2) {
      await removeFollow(targetId, userId);
      target.followingCount = Math.max(0, target.followingCount - 1);
      me.followersCount = Math.max(0, me.followersCount - 1);
    }
    await saveUser(me);
    await saveUser(target);
    res.json({ blocked: true });
  } catch (e) {
    console.error('Block user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/users/:id/unblock', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const targetId = req.params.id;
    await removeBlacklist(userId, targetId);
    res.json({ blocked: false });
  } catch (e) {
    console.error('Unblock user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/:id/block-status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ isBlocked: false });
    const targetId = req.params.id;
    const blocked = await isBlocked(userId, targetId);
    res.json({ isBlocked: blocked });
  } catch (e) {
    console.error('Block status error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== VERIFICATION CODE ==========
app.post('/api/auth/send-code', async (req, res) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone || !validatePhone(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }
    if (!purpose || !['register', 'bind_phone', 'change_password'].includes(purpose)) {
      return res.status(400).json({ error: '无效的验证类型' });
    }
    
    const code = generateVerificationCode();
    const vc = {
      id: genId('vc'),
      phone,
      code,
      purpose,
      expiresAt: Date.now() + 5 * 60 * 1000,
      used: false,
      createdAt: Date.now()
    };
    await saveVerificationCode(vc);
    
    console.log(`📱 验证码已发送到 ${phone}: ${code} (用途: ${purpose})`);
    
    res.json({ 
      success: true, 
      message: `验证码已发送：${code}`,
      devCode: code
    });
  } catch (e) {
    console.error('Send code error:', e);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// ========== BIND PHONE ==========
app.post('/api/users/me/bind-phone', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { phone, code } = req.body;
    if (!phone || !validatePhone(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: '请输入6位验证码' });
    }
    
    const users = await getUsers();
    if (users.find(u => u.phone === phone && u.id !== userId)) {
      return res.status(400).json({ error: '该手机号已被其他账号绑定' });
    }
    
    const vc = await findValidVerificationCode(phone, code, 'bind_phone');
    if (!vc) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    
    await markVerificationCodeUsed(vc.id);
    
    const me = users.find(u => u.id === userId);
    if (!me) return res.status(401).json({ error: '用户不存在' });
    me.phone = phone;
    await saveUser(me);
    
    res.json({ success: true, message: '绑定成功' });
  } catch (e) {
    console.error('Bind phone error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== CHANGE PASSWORD ==========
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    
    const { oldPassword, newPassword, confirmPassword, phone, code } = req.body;
    
    const users = await getUsers();
    const me = users.find(u => u.id === userId);
    if (!me) return res.status(401).json({ error: '用户不存在' });
    
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: '请输入新密码并确认' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: '两次密码输入不一致' });
    }
    
    const pwdValidation = validatePassword(newPassword);
    if (!pwdValidation.valid) {
      return res.status(400).json({ error: pwdValidation.message });
    }
    
    if (me.phone) {
      if (!phone || !code) {
        return res.status(400).json({ error: '请输入手机号和验证码' });
      }
      if (phone !== me.phone) {
        return res.status(400).json({ error: '请输入绑定的手机号' });
      }
      const vc = await findValidVerificationCode(phone, code, 'change_password');
      if (!vc) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      await markVerificationCodeUsed(vc.id);
    } else {
      if (!oldPassword) {
        return res.status(400).json({ error: '请输入原密码' });
      }
      if (me.password !== oldPassword) {
        return res.status(400).json({ error: '原密码错误' });
      }
    }
    
    me.password = newPassword;
    await saveUser(me);
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (e) {
    console.error('Change password error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== SEARCH ==========
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = getUserId(req);
    if (!q || !q.trim()) return res.json({ posts: [], users: [] });
    const query = q.trim();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 0);

    function textMatches(text) {
      if (!text) return false;
      const t = text.toLowerCase();
      if (keywords.length === 0) return t.includes(queryLower);
      return keywords.every(kw => t.includes(kw));
    }

    const posts = await getPosts();
    const users = await getUsers();
    const likes = await getLikes();
    const collects = await getCollects();
    const comments = await getComments();

    const postIdsWithComments = new Set();
    for (const c of comments) {
      if (textMatches(c.content)) {
        postIdsWithComments.add(c.postId);
      }
    }

    const matchedPosts = posts.filter(p => {
      if (textMatches(p.content)) return true;
      if (p.tags && p.tags.some(t => textMatches(t) || textMatches('#' + t))) return true;
      if (postIdsWithComments.has(p.id)) return true;
      return false;
    }).slice(0, 50);

    const matchedUsers = users.filter(u => {
      if (textMatches(u.username)) return true;
      if (textMatches(u.bio)) return true;
      return false;
    }).slice(0, 30).map(u => getUserPublic(u));

    const postsWithAuthor = matchedPosts.map(p => decoratePost(p, currentUserId, users, likes, collects, getTips()));
    res.json({ posts: postsWithAuthor, users: matchedUsers });
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: '服务器错误', posts: [], users: [] });
  }
});

// ========== UPLOAD ==========
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ========== ADMIN ==========
async function requireAdmin(userId) {
  if (!userId) return { error: '未登录', status: 401 };
  const users = await getUsers();
  const admin = users.find(u => u.id === userId);
  if (!admin || !admin.isAdmin) return { error: '需要管理员权限', status: 403 };
  return { admin };
}

app.post('/api/admin/ban/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const adminCheck = await requireAdmin(userId);
    if (adminCheck.error) return res.status(adminCheck.status).json({ error: adminCheck.error });
    const targetId = req.params.userId;
    const { duration, reason } = req.body;
    const users = await getUsers();
    const target = users.find(u => u.id === targetId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (target.isAdmin) return res.status(400).json({ error: '不能封禁管理员' });
    target.isBanned = true;
    target.banReason = reason || '违反社区规则';
    target.banUntil = duration ? Date.now() + duration : null;
    await saveUser(target);
    const banDurationStr = duration ? `（${Math.round(duration / 86400000)}天）` : '（永久）';
    await createNotification(targetId, 'system', `你的账号已被封禁${banDurationStr}，原因：${target.banReason}`, null, null);
    res.json({ ok: true, user: getUserPublic(target) });
  } catch (e) {
    console.error('Ban user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/admin/unban/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const adminCheck = await requireAdmin(userId);
    if (adminCheck.error) return res.status(adminCheck.status).json({ error: adminCheck.error });
    const targetId = req.params.userId;
    const users = await getUsers();
    const target = users.find(u => u.id === targetId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    target.isBanned = false;
    target.banUntil = null;
    target.banReason = null;
    await saveUser(target);
    await createNotification(targetId, 'system', '你的账号已解封，欢迎回来！', null, null);
    res.json({ ok: true, user: getUserPublic(target) });
  } catch (e) {
    console.error('Unban user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/admin/reward/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const adminCheck = await requireAdmin(userId);
    if (adminCheck.error) return res.status(adminCheck.status).json({ error: adminCheck.error });
    const targetId = req.params.userId;
    const { coins, vipDays, reason } = req.body;
    const users = await getUsers();
    const target = users.find(u => u.id === targetId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    const parts = [];
    if (coins && coins > 0) {
      target.wenshuCoin = (target.wenshuCoin || 0) + coins;
      parts.push(`${coins}文书币`);
    }
    if (vipDays && vipDays > 0) {
      if (target.isVip) {
        target.vipExpiresAt = (target.vipExpiresAt || Date.now()) + vipDays * 86400000;
      } else {
        target.isVip = true;
        target.vipLevel = 1;
        target.vipExp = 0;
        target.vipExpiresAt = Date.now() + vipDays * 86400000;
      }
      parts.push(`${vipDays}天VIP`);
    }
    await saveUser(target);
    const rewardStr = parts.join('、');
    if (rewardStr) {
      await createNotification(targetId, 'reward', `官方奖励：获得${rewardStr}${reason ? '（' + reason + '）' : ''}`, null, null);
    }
    res.json({ ok: true, user: getUserPublic(target), rewarded: parts });
  } catch (e) {
    console.error('Reward user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const userId = getUserId(req);
    const adminCheck = await requireAdmin(userId);
    if (adminCheck.error) return res.status(adminCheck.status).json({ error: adminCheck.error });
    const users = await getUsers();
    const { search } = req.query;
    let list = users;
    if (search) {
      const s = search.toLowerCase();
      list = users.filter(u => u.username.toLowerCase().includes(s) || (u.phone && u.phone.includes(s)));
    }
    res.json(list.slice(0, 100).map(u => getUserPublic(u)));
  } catch (e) {
    console.error('Admin list users error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== GROUP CHATS ==========
app.post('/api/groups', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const banCheck = await checkBanned(userId);
    if (banCheck) return res.status(403).json({ error: banCheck.reason });
    const { name, memberIds } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '群名称不能为空' });
    const groupNumber = await generateGroupNumber();
    const joinCode = generateJoinCode();
    const groupId = genId('group');
    const group = {
      id: groupId,
      groupNumber,
      name: name.trim(),
      avatar: null,
      ownerId: userId,
      joinCode,
      joinCodeExpiresAt: Date.now() + 86400000,
      lastMessage: '',
      lastMessageTime: Date.now(),
      memberCount: 1,
      createdAt: Date.now()
    };
    await saveGroupChat(group);
    await addGroupMember({ id: genId('gm'), groupId, userId, role: 'owner', joinedAt: Date.now() });
    const users = await getUsers();
    const conv = {
      id: groupId,
      type: 'group',
      name: name.trim(),
      avatar: null,
      participantIds: [userId, ...(memberIds || [])],
      lastMessage: '',
      lastMessageTime: Date.now(),
      unreadCount: 0
    };
    const friendIds = [];
    for (const mid of (memberIds || [])) {
      if (await isGroupMember(groupId, mid)) continue;
      await addGroupMember({ id: genId('gm'), groupId, userId: mid, role: 'member', joinedAt: Date.now() });
      friendIds.push(mid);
      await createNotification(mid, 'group_invite', `你被邀请加入群聊「${name.trim()}」（群号：${groupNumber}）`, userId, null);
    }
    group.memberCount = friendIds.length + 1;
    await saveGroupChat(group);
    await saveConversation(conv);
    res.json({ ...group, joinCode, role: 'owner' });
  } catch (e) {
    console.error('Create group error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/groups/mine', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json([]);
    const myGroups = await getUserGroups(userId);
    const users = await getUsers();
    const result = [];
    for (const g of myGroups) {
      const members = await getGroupMembers(g.id);
      const memberUsers = [];
      for (const m of members.slice(0, 5)) {
        const u = users.find(u => u.id === m.userId);
        if (u) memberUsers.push({ id: u.id, username: u.username, avatar: u.avatar });
      }
      const myMember = members.find(m => m.userId === userId);
      result.push({
        ...g,
        role: myMember?.role || 'member',
        membersPreview: memberUsers,
        isOwner: g.ownerId === userId
      });
    }
    res.json(result);
  } catch (e) {
    console.error('Get my groups error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/groups/join', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const banCheck = await checkBanned(userId);
    if (banCheck) return res.status(403).json({ error: banCheck.reason });
    const { code, groupNumber } = req.body;
    let group = null;
    if (code) {
      const chats = await getGroupChats();
      group = chats.find(g => g.joinCode.toUpperCase() === code.toUpperCase() && (!g.joinCodeExpiresAt || g.joinCodeExpiresAt > Date.now()));
      if (!group) return res.status(400).json({ error: '邀请码无效或已过期' });
    } else if (groupNumber) {
      group = await getGroupChatByNumber(groupNumber);
      if (!group) return res.status(404).json({ error: '群号不存在' });
    } else {
      return res.status(400).json({ error: '请输入邀请码或群号' });
    }
    if (await isGroupMember(group.id, userId)) return res.json({ ...group, alreadyJoined: true });
    await addGroupMember({ id: genId('gm'), groupId: group.id, userId, role: 'member', joinedAt: Date.now() });
    group.memberCount = (group.memberCount || 1) + 1;
    await saveGroupChat(group);
    const convs = await getConversations();
    let conv = convs.find(c => c.id === group.id);
    if (conv) {
      if (!conv.participantIds.includes(userId)) conv.participantIds.push(userId);
      await saveConversation(conv);
    } else {
      await saveConversation({
        id: group.id, type: 'group', name: group.name, avatar: group.avatar,
        participantIds: [group.ownerId, userId], lastMessage: '', lastMessageTime: Date.now(), unreadCount: 0
      });
    }
    await createNotification(group.ownerId, 'group_join', `有人加入了你的群聊「${group.name}」`, userId, null);
    res.json({ ...group, joined: true });
  } catch (e) {
    console.error('Join group error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/groups/:id/refresh-code', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const group = await getGroupChatById(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    if (group.ownerId !== userId) return res.status(403).json({ error: '只有群主可以刷新邀请码' });
    const newCode = generateJoinCode();
    group.joinCode = newCode;
    group.joinCodeExpiresAt = Date.now() + 86400000;
    await saveGroupChat(group);
    res.json({ joinCode: newCode, expiresAt: group.joinCodeExpiresAt });
  } catch (e) {
    console.error('Refresh join code error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/groups/:id/rename', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '群名不能为空' });
    const group = await getGroupChatById(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    if (group.ownerId !== userId) return res.status(403).json({ error: '只有群主可以修改群名' });
    group.name = name.trim();
    await saveGroupChat(group);
    const convs = await getConversations();
    const conv = convs.find(c => c.id === group.id);
    if (conv) {
      conv.name = name.trim();
      await saveConversation(conv);
    }
    res.json({ ok: true, name: group.name });
  } catch (e) {
    console.error('Rename group error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/groups/:id/members', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const group = await getGroupChatById(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    const members = await getGroupMembers(group.id);
    const users = await getUsers();
    const result = members.map(m => {
      const u = users.find(u => u.id === m.userId);
      return u ? { userId: m.userId, role: m.role, username: u.username, avatar: u.avatar, isVip: u.isVip } : null;
    }).filter(Boolean);
    res.json(result);
  } catch (e) {
    console.error('Get group members error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/groups/:id/leave', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const group = await getGroupChatById(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    if (group.ownerId === userId) return res.status(400).json({ error: '群主不能退群，请先转让群' });
    await removeGroupMember(group.id, userId);
    group.memberCount = Math.max(1, (group.memberCount || 1) - 1);
    await saveGroupChat(group);
    res.json({ ok: true });
  } catch (e) {
    console.error('Leave group error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== FRIENDS (MUTUAL FOLLOWS) ==========
app.get('/api/friends', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json([]);
    const follows = await getFollows();
    const users = await getUsers();

    const iFollow = new Set();
    const followersOfMe = new Set();
    for (const f of follows) {
      if (f.followerId === userId) iFollow.add(f.followingId);
      if (f.followingId === userId) followersOfMe.add(f.followerId);
    }

    const mutualIds = [];
    for (const id of iFollow) {
      if (followersOfMe.has(id)) mutualIds.push(id);
    }

    const friends = mutualIds.map(id => users.find(u => u.id === id)).filter(Boolean).map(u => getUserPublic(u));
    console.log(`👥 Friends for ${userId}: iFollow=${iFollow.size}, followers=${followersOfMe.size}, mutual=${friends.length}`);
    res.json(friends);
  } catch (e) {
    console.error('Get friends error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== SEED POSTS (first run) ==========
app.post('/api/seed', async (req, res) => {
  try {
    const posts = await getPosts();
    if (posts.length > 0) return res.json({ message: '已有帖子数据', count: posts.length });
    const users = await getUsers();
    if (users.length === 0) return res.status(400).json({ error: '请先注册用户' });

    const botNames = ['文书小助手', '生活记录者', '读书爱好者', '咖啡控', '摄影小白', '跑步达人', '美食猎人'];
    const botUsers = [];
    botNames.forEach(name => {
      const existing = users.find(u => u.username === name);
      if (existing) { botUsers.push(existing); return; }
      const color = '333333';
      const bot = {
        id: genId('bot'),
        username: name,
        password: 'bot123456',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color}&color=fff&size=200&bold=true`,
        cover: `https://picsum.photos/seed/bot${name}/800/320`,
        bio: '我是机器人，分享美好生活~',
        location: '',
        wenshuCoin: 0,
        isAdmin: name === '文书小助手',
        isVip: name === '文书小助手',
        vipLevel: name === '文书小助手' ? 10 : 0,
        vipExp: 0,
        vipExpiresAt: null,
        followingCount: 0,
        followersCount: 0,
        likesCount: 0,
        registerRank: 0,
        isBanned: false,
        banUntil: null,
        banReason: null,
        isSignedInToday: false,
        lastSignInDate: '',
        consecutiveSignDays: 0,
        createdAt: Date.now(),
        joinedQQGroup: false
      };
      botUsers.push(bot);
    });
    for (const u of botUsers) await saveUser(u);

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

    const now = Date.now();
    for (let i = 0; i < seedPosts.length; i++) {
      const seed = seedPosts[i];
      const author = botUsers[Math.floor(Math.random() * botUsers.length)];
      const likeCount = Math.floor(Math.random() * 200) + 10;
      const commentCount = Math.floor(Math.random() * 30);
      const collectCount = Math.floor(Math.random() * 50);
      await savePost({
        id: genId('post'),
        authorId: author.id,
        title: '',
        content: seed.content,
        images: seed.images,
        tags: seed.tags,
        likeCount,
        commentCount,
        collectCount,
        createdAt: now - i * 3600000 * (Math.random() * 4 + 1)
      });
    }
    const allPosts = await getPosts();
    res.json({ message: '种子帖子已创建', count: allPosts.length });
  } catch (e) {
    console.error('Seed error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

app.get('/', (req, res) => {
  res.json({ message: '文书APP API is running', version: '1.1' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在', path: req.originalUrl });
});

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在', path: req.originalUrl });
});

async function startServer() {
  await initDB();
  await seedInitialData();
  const users = await getUsers();
  const posts = await getPosts();
  let assistantUser = users.find(u => u.username === '文书小助手');
  if (!assistantUser) {
    assistantUser = {
      id: genId('bot'),
      username: '文书小助手',
      password: 'bot123456',
      avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent('文书小助手') + '&background=000000&color=fff&size=200&bold=true',
      cover: 'https://picsum.photos/seed/bot_assistant/800/320',
      bio: '文书APP官方助手',
      location: '',
      wenshuCoin: 0,
      isAdmin: true,
      isVip: true,
      vipLevel: 10,
      vipExp: 0,
      vipExpiresAt: null,
      followingCount: 0,
      followersCount: 0,
      likesCount: 0,
      registerRank: 0,
      isBanned: false,
      banUntil: null,
      banReason: null,
      isSignedInToday: false,
      lastSignInDate: '',
      consecutiveSignDays: 0,
      createdAt: Date.now(),
      joinedQQGroup: false
    };
    await saveUser(assistantUser);
  } else {
    let changed = false;
    if (!assistantUser.isAdmin) { assistantUser.isAdmin = true; changed = true; }
    if (!assistantUser.isVip) { assistantUser.isVip = true; changed = true; }
    if (changed) await saveUser(assistantUser);
  }
  if (posts.length < 10) {
    const botNames = ['生活记录者', '读书爱好者', '咖啡控', '摄影小白', '跑步达人', '美食猎人'];
    const botUsers = [assistantUser];
    for (const name of botNames) {
      const exists = users.find(u => u.username === name);
      if (!exists) {
        const bot = {
          id: genId('bot'),
          username: name,
          password: 'bot123456',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=333333&color=fff&size=200&bold=true`,
          cover: `https://picsum.photos/seed/bot${name}/800/320`,
          bio: '我是机器人，分享美好生活~',
          location: '',
          wenshuCoin: Math.floor(Math.random() * 5000),
          isAdmin: false,
          isVip: false,
          vipLevel: 0,
          vipExp: 0,
          vipExpiresAt: null,
          followingCount: Math.floor(Math.random() * 100),
          followersCount: Math.floor(Math.random() * 2000),
          likesCount: Math.floor(Math.random() * 5000),
          registerRank: 0,
          isBanned: false,
          banUntil: null,
          banReason: null,
          isSignedInToday: false,
          lastSignInDate: '',
          consecutiveSignDays: Math.floor(Math.random() * 30),
          createdAt: Date.now() - Math.floor(Math.random() * 86400000 * 30),
          joinedQQGroup: Math.random() > 0.5
        };
        await saveUser(bot);
        botUsers.push(bot);
      } else {
        botUsers.push(exists);
      }
    }
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
    const now = Date.now();
    for (let i = 0; i < seedPosts.length; i++) {
      const seed = seedPosts[i];
      const author = botUsers[Math.floor(Math.random() * botUsers.length)];
      await savePost({
        id: genId('post'),
        authorId: author.id,
        title: '',
        content: seed.content,
        images: seed.images,
        tags: seed.tags,
        likeCount: Math.floor(Math.random() * 200) + 10,
        commentCount: Math.floor(Math.random() * 30),
        collectCount: Math.floor(Math.random() * 50),
        createdAt: now - i * 3600000 * (Math.random() * 4 + 1)
      });
    }
  }

  // ========== 文书阅读 / 图书 APIs ==========
  app.get('/api/books', authOptional, async (req, res) => {
    const uid = getUserId(req);
    let books = await getBooks();
    books = books.filter(b => !b.isPrivate || b.authorId === uid);
    if (req.query.type === 'novel') books = books.filter(b => b.category === 'novel');
    const users = await getUsers();
    books = books.map(b => {
      const author = users.find(u => u.id === b.authorId);
      return { ...b, authorName: author?.username || '匿名', authorAvatar: author?.avatar };
    }).sort((a, b) => b.createdAt - a.createdAt);
    res.json(books);
  });

  app.get('/api/books/:id', authOptional, async (req, res) => {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: '图书不存在' });
    const uid = getUserId(req);
    if (book.isPrivate && book.authorId !== uid) return res.status(403).json({ error: '无权访问' });
    res.json(book);
  });

  app.post('/api/books', auth, async (req, res) => {
    const uid = getUserId(req);
    const { title, description, category = 'book', content = '', fileUrl = '', coverUrl = '', isPrivate = false } = req.body;
    if (!title) return res.status(400).json({ error: '请输入书名' });
    const book = {
      id: genId('book'),
      authorId: uid,
      title, description, category, content, fileUrl, coverUrl,
      isPrivate: !!isPrivate,
      readCount: 0, likeCount: 0,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    await saveBook(book);
    res.json(book);
  });

  app.post('/api/books/upload', auth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.originalname });
  });

  app.post('/api/books/:id/read', authOptional, async (req, res) => {
    const books = await getBooks();
    const i = books.findIndex(b => b.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: '图书不存在' });
    books[i].readCount = (books[i].readCount || 0) + 1;
    await saveBook(books[i]);
    res.json({ success: true });
  });

  app.delete('/api/books/:id', auth, async (req, res) => {
    const uid = getUserId(req);
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: '图书不存在' });
    if (book.authorId !== uid) return res.status(403).json({ error: '无权删除' });
    await deleteBook(req.params.id);
    res.json({ success: true });
  });

  // ========== 文书天地 (官方精选) ==========
  app.get('/api/official/posts', authOptional, async (req, res) => {
    let posts = await getPosts();
    const users = await getUsers();
    const botIds = users.filter(u => u.isBot || u.role === 'admin' || u.id === 'official').map(u => u.id);
    posts = posts.filter(p => botIds.includes(p.authorId) || (p.tags && p.tags.includes('官方精选')));
    posts = posts.map(p => {
      const author = users.find(u => u.id === p.authorId);
      return { ...p, authorName: author?.username, authorAvatar: author?.avatar, isLiked: false, isCollected: false };
    }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    res.json(posts);
  });

  // ========== 文书小应用 APIs ==========
  app.get('/api/miniapps', authOptional, async (req, res) => {
    const apps = await getMiniApps();
    res.json(apps.sort((a, b) => b.createdAt - a.createdAt));
  });

  app.post('/api/miniapps', auth, async (req, res) => {
    const uid = getUserId(req);
    const users = await getUsers();
    const user = users.find(u => u.id === uid);
    const { name, description, url, icon = '📱', category = 'other' } = req.body;
    if (!name || !url) return res.status(400).json({ error: '请填写应用名称和URL' });
    const app = { id: genId('app'), name, description, url, icon, category, developerId: uid, developerName: user?.username || '匿名', createdAt: Date.now() };
    await saveMiniApp(app);
    res.json(app);
  });

  // ========== 文书游戏 APIs ==========
  app.get('/api/games', authOptional, async (req, res) => {
    const games = await getGames();
    res.json(games.sort((a, b) => (b.plays || 0) - (a.plays || 0)));
  });

  app.post('/api/games', auth, async (req, res) => {
    const uid = getUserId(req);
    const users = await getUsers();
    const user = users.find(u => u.id === uid);
    const { name, description, url, icon = '🎮', category = 'other' } = req.body;
    if (!name || !url) return res.status(400).json({ error: '请填写游戏名称和URL' });
    const game = { id: genId('game'), name, description, url, icon, category, developerId: uid, developerName: user?.username || '匿名', plays: 0, createdAt: Date.now() };
    await saveGame(game);
    res.json(game);
  });

  app.post('/api/games/:id/play', authOptional, async (req, res) => {
    const games = await getGames();
    const i = games.findIndex(g => g.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: '游戏不存在' });
    games[i].plays = (games[i].plays || 0) + 1;
    await saveGame(games[i]);
    res.json({ success: true });
  });

  // ========== 文书空间 (秘帖) APIs ==========
  app.get('/api/secret/posts', auth, async (req, res) => {
    const uid = getUserId(req);
    const users = await getUsers();
    const posts = await getSecretPosts();
    const mine = req.query.mine === 'true';

    let visible;
    if (mine) {
      visible = posts.filter(p => p.authorId === uid);
    } else {
      const follows = await getFollows();
      const following = new Set(follows.filter(f => f.followerId === uid).map(f => f.followingId));
      const followers = new Set(follows.filter(f => f.followingId === uid).map(f => f.followerId));
      const mutualIds = new Set([...following].filter(id => followers.has(id)));

      visible = posts.filter(p => {
        if (p.authorId === uid) return true;
        if (p.visibility === 'public') return true;
        if (p.visibility === 'mutual' && mutualIds.has(p.authorId)) return true;
        if (p.visibility === 'specified' && p.allowedUsers?.includes(uid)) return true;
        return false;
      });
    }

    visible = visible.map(p => {
      const author = users.find(u => u.id === p.authorId);
      return { ...p, authorName: author?.username, authorAvatar: author?.avatar };
    }).sort((a, b) => b.createdAt - a.createdAt);
    res.json(visible);
  });

  app.post('/api/secret/posts', auth, async (req, res) => {
    const uid = getUserId(req);
    const { content, images = [], visibility = 'private', allowedUsers = [] } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const post = {
      id: genId('secret'), authorId: uid, content, images,
      visibility, allowedUsers: visibility === 'specified' ? allowedUsers : [],
      likeCount: 0, commentCount: 0, createdAt: Date.now()
    };
    await saveSecretPost(post);
    res.json(post);
  });

  app.delete('/api/secret/posts/:id', auth, async (req, res) => {
    const uid = getUserId(req);
    const posts = await getSecretPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    if (post.authorId !== uid) return res.status(403).json({ error: '无权删除' });
    await deleteSecretPost(req.params.id);
    res.json({ success: true });
  });

  app.put('/api/secret/posts/:id/visibility', auth, async (req, res) => {
    const uid = getUserId(req);
    const posts = await getSecretPosts();
    const i = posts.findIndex(p => p.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: '帖子不存在' });
    if (posts[i].authorId !== uid) return res.status(403).json({ error: '无权修改' });
    const { visibility, allowedUsers = [] } = req.body;
    posts[i].visibility = visibility;
    posts[i].allowedUsers = visibility === 'specified' ? allowedUsers : [];
    await saveSecretPost(posts[i]);
    res.json(posts[i]);
  });

  app.get('/api/secret/visits', auth, async (req, res) => {
    const uid = getUserId(req);
    const visits = await getSecretVisits();
    const users = await getUsers();
    const myVisits = visits.filter(v => v.spaceOwnerId === uid).map(v => {
      const visitor = users.find(u => u.id === v.visitorId);
      return { ...v, visitorName: visitor?.username, visitorAvatar: visitor?.avatar };
    }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    res.json(myVisits);
  });

  app.post('/api/secret/visit/:userId', auth, async (req, res) => {
    const uid = getUserId(req);
    if (uid === req.params.userId) return res.json({ success: true });
    await addSecretVisit({ id: genId('sv'), spaceOwnerId: req.params.userId, visitorId: uid, createdAt: Date.now() });
    res.json({ success: true });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 文书APP后端服务运行在 port ${PORT}`);
  });
}

startServer().catch(e => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
