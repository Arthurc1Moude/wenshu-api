import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getUsers, saveUsers, saveUser,
  getPosts, savePosts,
  getComments, saveComments,
  getActivities, saveActivities,
  getNotifications, saveNotifications,
  getConversations, saveConversations,
  getMessages, saveMessages,
  getRedeemCodes, saveRedeemCodes,
  getRedeemRecords, saveRedeemRecords,
  getLikes, saveLikes,
  getCollects, saveCollects,
  getFollows, saveFollows,
  getBlacklists, saveBlacklist, deleteBlacklist,
  getRegisterCount, incrementRegisterCount,
  saveVerificationCode, findValidVerificationCode, markVerificationCodeUsed, findUserByPhone,
  getCommentLikes, saveCommentLikes,
  seedInitialData
} from './db.js';

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

seedInitialData();

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
  return safe;
}

function decoratePost(post, currentUserId, users, likes, collects) {
  const author = users.find(u => u.id === post.authorId);
  return {
    ...post,
    author: author ? getUserPublic(author) : null,
    isLiked: currentUserId ? likes.some(l => l.postId === post.id && l.userId === currentUserId) : false,
    isCollected: currentUserId ? collects.some(c => c.postId === post.id && c.userId === currentUserId) : false,
  };
}

function createNotification(userId, type, content, fromUserId, postId) {
  const notifications = getNotifications();
  const users = getUsers();
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
  notifications.unshift(notif);
  saveNotifications(notifications);
  return notif;
}

function addCoins(userId, amount, reason) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  user.wenshuCoin = (user.wenshuCoin || 0) + amount;
  saveUsers(users);
  createNotification(userId, 'system', `获得${amount}文书币：${reason}`, null, null);
  return user;
}

function addVipExp(userId, amount) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user || !user.isVip) return null;
  user.vipExp = (user.vipExp || 0) + amount;
  let nextLevelExp = user.vipLevel * 100;
  while (user.vipExp >= nextLevelExp && user.vipLevel < 100) {
    user.vipLevel += 1;
    user.vipExp -= nextLevelExp;
    nextLevelExp = user.vipLevel * 100;
    createNotification(userId, 'system', `恭喜！文书会等级提升至 Lv${user.vipLevel}！`, null, null);
  }
  saveUsers(users);
  return user;
}

function createWelcomeConversation(userId) {
  const conversations = getConversations();
  const messages = getMessages();

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
  conversations.push(officialConv);

  const welcomeMsgs = [
    '欢迎来到文书APP！🎉',
    '这里是一个记录生活、分享美好的社区。',
    '你可以：每日签到获得文书币、参与活动赢取奖励、加入文书会享受特权。',
    '加入官方QQ群(702404026)可以领取300文书币，并参与定时抢兑换码活动哦！',
    '快去发布你的第一篇帖子吧~✨',
  ];
  let msgTime = Date.now() - welcomeMsgs.length * 60000;
  welcomeMsgs.forEach(content => {
    messages.push({
      id: genId('msg'),
      conversationId: officialConv.id,
      senderId: 'system_assistant',
      content,
      createdAt: msgTime,
      read: false,
    });
    msgTime += 60000;
  });

  saveConversations(conversations);
  saveMessages(messages);
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ========== AUTH ==========
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
    
    const pwdValidation = validatePassword(password);
    if (!pwdValidation.valid) return res.status(400).json({ error: pwdValidation.message });
    
    if (phone && !validatePhone(phone)) return res.status(400).json({ error: '手机号格式不正确' });
    
    const users = getUsers();
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

    const rank = incrementRegisterCount();
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
    users.push(user);
    saveUsers(users);

    createWelcomeConversation(user.id);

    if (bonusCoins > 0) {
      createNotification(user.id, 'system', `恭喜！作为第${rank}位注册用户，您获得了${bonusCoins}文书币奖励！`, null, null);
    }
    createNotification(user.id, 'system', '欢迎加入文书APP！记得每日签到领取文书币哦~', null, null);

    res.json({ user: getUserPublic(user), token: user.id });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const users = getUsers();
    let user = users.find(u => u.username === username && u.password === password);
    if (!user && validatePhone(username)) {
      user = users.find(u => u.phone === username && u.password === password);
    }
    if (!user) return res.status(400).json({ error: '用户名或密码错误' });

    const today = getTodayStr();
    user.isSignedInToday = (user.lastSignInDate === today);
    saveUsers(users);

    res.json({ user: getUserPublic(user), token: user.id });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/auth/send-code', (req, res) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone || !validatePhone(phone)) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    if (!purpose) {
      return res.status(400).json({ error: '验证码用途不能为空' });
    }
    
    const code = generateVerificationCode();
    const vc = {
      id: genId('vc'),
      phone,
      code,
      purpose,
      used: false,
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now()
    };
    saveVerificationCode(vc);
    
    console.log(`📱 验证码发送到 ${phone}: ${code} (用途: ${purpose})`);
    
    res.json({ 
      success: true, 
      message: '验证码已发送', 
      devCode: process.env.NODE_ENV === 'production' ? null : code 
    });
  } catch (e) {
    console.error('Send code error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/users/me/bind-phone', (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { phone, code } = req.body;
    
    if (!phone || !validatePhone(phone)) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: '请输入6位验证码' });
    }
    
    const users = getUsers();
    const me = users.find(u => u.id === userId);
    if (!me) return res.status(401).json({ error: '用户不存在' });
    
    const existingUser = users.find(u => u.phone === phone && u.id !== userId);
    if (existingUser) {
      return res.status(409).json({ error: '该手机号已被其他账号绑定' });
    }
    
    const vc = findValidVerificationCode(phone, code, 'bind_phone');
    if (!vc) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    
    markVerificationCodeUsed(vc.id);
    
    me.phone = phone;
    saveUsers(users);
    
    res.json({ success: true, message: '绑定成功' });
  } catch (e) {
    console.error('Bind phone error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { oldPassword, newPassword, confirmPassword, phone, code } = req.body;
    
    const pwdValidation = validatePassword(newPassword);
    if (!pwdValidation.valid) {
      return res.status(400).json({ error: pwdValidation.message });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: '两次密码输入不一致' });
    }
    
    const users = getUsers();
    const me = users.find(u => u.id === userId);
    if (!me) return res.status(401).json({ error: '用户不存在' });
    
    if (me.phone && phone && code) {
      if (!validatePhone(phone)) {
        return res.status(400).json({ error: '手机号格式不正确' });
      }
      if (me.phone !== phone) {
        return res.status(400).json({ error: '请输入当前账号绑定的手机号' });
      }
      const vc = findValidVerificationCode(phone, code, 'change_password');
      if (!vc) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      markVerificationCodeUsed(vc.id);
    } else if (oldPassword) {
      if (me.password !== oldPassword) {
        return res.status(400).json({ error: '原密码错误' });
      }
    } else {
      return res.status(400).json({ error: '请提供手机验证码或原密码' });
    }
    
    me.password = newPassword;
    saveUsers(users);
    
    res.json({ success: true, message: '密码修改成功，请重新登录' });
  } catch (e) {
    console.error('Change password error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/me', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });

  const today = getTodayStr();
  user.isSignedInToday = (user.lastSignInDate === today);
  saveUsers(users);

  res.json(getUserPublic(user));
});

app.put('/api/users/me', (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(401).json({ error: '未登录' });
    const { username, bio, avatar, cover, location } = req.body;
    if (username) {
      if (users.find(u => u.username === username && u.id !== userId)) {
        return res.status(400).json({ error: '用户名已被使用' });
      }
      users[idx].username = username;
    }
    if (bio !== undefined) users[idx].bio = bio;
    if (avatar) users[idx].avatar = avatar;
    if (cover) users[idx].cover = cover;
    if (location !== undefined) users[idx].location = location;
    saveUsers(users);
    res.json(getUserPublic(users[idx]));
  } catch (e) {
    console.error('Update user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const users = getUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const currentUserId = getUserId(req);
    const follows = getFollows();
    let isFollowing = false;
    let isMutual = false;
    if (currentUserId && currentUserId !== user.id) {
      isFollowing = follows.some(f => f.followerId === currentUserId && f.followingId === user.id);
      const isFollowedBy = follows.some(f => f.followerId === user.id && f.followingId === currentUserId);
      isMutual = isFollowing && isFollowedBy;
    }
    const userPublic = getUserPublic(user);
    userPublic.isFollowing = isFollowing;
    userPublic.isMutual = isMutual;
    res.json(userPublic);
  } catch (e) {
    console.error('Get user error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== SIGN IN ==========
app.post('/api/coin/signin', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
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

  const baseCoins = 10;
  const bonusCoins = Math.min((user.consecutiveSignDays - 1) * 5, 40);
  const vipBonus = user.isVip ? 10 : 0;
  const totalCoins = baseCoins + bonusCoins + vipBonus;

  user.wenshuCoin += totalCoins;
  user.lastSignInDate = today;
  user.isSignedInToday = true;
  saveUsers(users);

  addVipExp(userId, 10);
  createNotification(user.id, 'system', `每日签到成功！获得${totalCoins}文书币（连续${user.consecutiveSignDays}天）`, null, null);

  res.json({ coins: totalCoins, consecutiveDays: user.consecutiveSignDays, totalCoins: user.wenshuCoin });
});

app.post('/api/coin/join-qq', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '未登录' });
  if (user.joinedQQGroup) return res.status(400).json({ error: '已领取过QQ群奖励' });
  user.joinedQQGroup = true;
  user.wenshuCoin += 200;
  saveUsers(users);
  createNotification(user.id, 'system', '加入QQ群奖励：获得200文书币！QQ群号：702404026', null, null);
  res.json({ coins: 200, totalCoins: user.wenshuCoin });
});

// ========== VIP ==========
app.post('/api/vip/purchase', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '未登录' });
  if (user.isVip) return res.status(400).json({ error: '已是文书会会员' });

  user.isVip = true;
  user.vipLevel = 1;
  user.vipExp = 0;
  user.vipExpiresAt = Date.now() + 365 * 24 * 3600 * 1000;
  user.wenshuCoin += 500;
  saveUsers(users);

  createNotification(user.id, 'vip', '欢迎加入文书会！获得500文书币开通奖励，开始享受会员特权吧！', null, null);
  res.json({ user: getUserPublic(user) });
});

// ========== REDEEM CODE ==========
app.post('/api/redeem', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const { code } = req.body;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '未登录' });

  const codes = getRedeemCodes();
  const redeemCode = codes.find(c => c.code.toUpperCase() === code.toUpperCase());
  if (!redeemCode) return res.status(400).json({ error: '兑换码无效或已过期' });
  if (redeemCode.validUntil < Date.now()) return res.status(400).json({ error: '兑换码无效或已过期' });
  if (!redeemCode.usedBy) redeemCode.usedBy = [];
  if (redeemCode.usedBy.includes(user.id)) return res.status(400).json({ error: '已使用过此兑换码' });

  redeemCode.usedBy.push(user.id);
  saveRedeemCodes(codes);

  const records = getRedeemRecords();
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
    records.unshift({
      id: genId('rec'),
      userId: user.id,
      code: redeemCode.code,
      coinValue: 0,
      rewardType: 'vip',
      redeemedAt: Date.now()
    });
    createNotification(user.id, 'vip', '🎉 兑换成功！文书会VIP已激活，开始享受会员特权吧！', null, null);
  } else {
    user.wenshuCoin += redeemCode.coinValue;
    responseData.coins = redeemCode.coinValue;
    responseData.totalCoins = user.wenshuCoin;
    records.unshift({
      id: genId('rec'),
      userId: user.id,
      code: redeemCode.code,
      coinValue: redeemCode.coinValue,
      rewardType: 'coin',
      redeemedAt: Date.now()
    });
    createNotification(user.id, 'redeem_success', `兑换成功！获得${redeemCode.coinValue}文书币（${redeemCode.description}）`, null, null);
  }

  saveUsers(users);
  saveRedeemRecords(records);

  res.json(responseData);
});

app.get('/api/redeem/records', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json([]);
  const records = getRedeemRecords();
  res.json(records.filter(r => r.userId === userId));
});

// ========== POSTS ==========
app.get('/api/posts', (req, res) => {
  const { sort = 'new', tag, userId } = req.query;
  const currentUserId = getUserId(req);
  let posts = getPosts();
  const users = getUsers();
  const likes = getLikes();
  const collects = getCollects();

  if (tag) posts = posts.filter(p => p.tags.some(t => t.includes(tag)));
  if (userId) posts = posts.filter(p => p.authorId === userId);

  if (sort === 'hot') {
    posts = [...posts].sort((a, b) => (b.likeCount * 3 + b.commentCount * 2 + b.collectCount) - (a.likeCount * 3 + a.commentCount * 2 + a.collectCount));
  } else {
    posts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  }

  res.json(posts.map(p => decoratePost(p, currentUserId, users, likes, collects)));
});

app.get('/api/posts/:id', (req, res) => {
  const currentUserId = getUserId(req);
  const posts = getPosts();
  const users = getUsers();
  const likes = getLikes();
  const collects = getCollects();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  res.json(decoratePost(post, currentUserId, users, likes, collects));
});

app.post('/api/posts', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '未登录' });
  const { content, images, tags } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  const posts = getPosts();
  const post = {
    id: genId('post'),
    authorId: userId,
    content: content.trim(),
    images: images || [],
    tags: tags || [],
    likeCount: 0,
    commentCount: 0,
    collectCount: 0,
    createdAt: Date.now()
  };
  posts.unshift(post);
  savePosts(posts);

  addVipExp(userId, 20);

  if (tags && tags.length > 0) {
    const activities = getActivities();
    tags.forEach(tag => {
      const activity = activities.find(a => a.hashtag === tag && a.status === 'active');
      if (activity && !activity.participants.includes(userId)) {
        activity.participantCount++;
        activity.participants.push(userId);
      }
    });
    saveActivities(activities);
  }

  res.json({
    ...post,
    author: getUserPublic(user),
    isLiked: false,
    isCollected: false,
  });
});

app.post('/api/posts/:id/like', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const posts = getPosts();
  const users = getUsers();
  const likes = getLikes();
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '帖子不存在' });

  const post = posts[idx];
  const existing = likes.findIndex(l => l.postId === post.id && l.userId === userId);
  if (existing !== -1) {
    post.likeCount--;
    likes.splice(existing, 1);
  } else {
    post.likeCount++;
    likes.push({ id: genId('like'), postId: post.id, userId, createdAt: Date.now() });
    const author = users.find(u => u.id === post.authorId);
    if (author) author.likesCount++;
    if (post.authorId !== userId) {
      createNotification(post.authorId, 'like', '赞了你的帖子', userId, post.id);
    }
    addVipExp(userId, 1);
  }
  savePosts(posts);
  saveUsers(users);
  saveLikes(likes);
  res.json({ likeCount: post.likeCount, isLiked: existing === -1 });
});

app.post('/api/posts/:id/collect', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const posts = getPosts();
  const collects = getCollects();
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
  const post = posts[idx];
  const existing = collects.findIndex(c => c.postId === post.id && c.userId === userId);
  if (existing !== -1) {
    post.collectCount--;
    collects.splice(existing, 1);
  } else {
    post.collectCount++;
    collects.push({ id: genId('collect'), postId: post.id, userId, createdAt: Date.now() });
  }
  savePosts(posts);
  saveCollects(collects);
  res.json({ collectCount: post.collectCount, isCollected: existing === -1 });
});

// ========== COMMENTS ==========
app.get('/api/posts/:id/comments', (req, res) => {
  try {
    const currentUserId = getUserId(req);
    const comments = getComments();
    const users = getUsers();
    const commentLikes = getCommentLikes();
    const postComments = comments.filter(c => c.postId === req.params.id).sort((a, b) => a.createdAt - b.createdAt);
    const result = postComments.map(c => {
      const author = users.find(u => u.id === c.authorId);
      const replyToUser = c.replyToId ? users.find(u => u.id === c.replyToId) : null;
      const isLiked = currentUserId ? commentLikes.some(l => l.commentId === c.id && l.userId === currentUserId) : false;
      return {
        ...c,
        likeCount: c.likeCount || 0,
        isLiked,
        author: author ? getUserPublic(author) : null,
        replyToUser: replyToUser ? { id: replyToUser.id, username: replyToUser.username } : null
      };
    });
    res.json(result);
  } catch (e) {
    console.error('Get comments error:', e);
    res.status(500).json({ error: '获取评论失败' });
  }
});

app.post('/api/posts/:id/comments', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '未登录' });
  const { content, replyToId } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });

  const posts = getPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const comments = getComments();
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
  comments.push(comment);
  post.commentCount++;
  saveComments(comments);
  savePosts(posts);

  addVipExp(userId, 5);

  if (post.authorId !== userId) {
    const replyToUser = replyToId ? users.find(u => u.id === replyToId) : null;
    const notifContent = replyToUser ? `回复了你的评论：${content.slice(0, 20)}` : `评论了你的帖子：${content.slice(0, 20)}`;
    const notifyUserId = replyToId || post.authorId;
    createNotification(notifyUserId, 'comment', notifContent, userId, post.id);
  }

  const replyToUser = replyToId ? users.find(u => u.id === replyToId) : null;
  res.json({
    ...comment,
    author: getUserPublic(user),
    replyToUser: replyToUser ? { id: replyToUser.id, username: replyToUser.username } : null,
  });
});

app.post('/api/comments/:id/like', (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const comments = getComments();
    const commentLikes = getCommentLikes();
    const idx = comments.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '评论不存在' });
    const comment = comments[idx];
    const existingIdx = commentLikes.findIndex(l => l.commentId === comment.id && l.userId === userId);
    
    let isLiked = false;
    if (existingIdx !== -1) {
      commentLikes.splice(existingIdx, 1);
      comment.likeCount = Math.max(0, (comment.likeCount || 0) - 1);
    } else {
      commentLikes.push({ id: genId('clike'), commentId: comment.id, userId, createdAt: Date.now() });
      comment.likeCount = (comment.likeCount || 0) + 1;
      isLiked = true;
    }
    
    saveComments(comments);
    saveCommentLikes(commentLikes);
    res.json({ likeCount: comment.likeCount, isLiked });
  } catch (e) {
    console.error('Comment like error:', e);
    res.status(500).json({ error: '操作失败' });
  }
});

// ========== ACTIVITIES ==========
app.get('/api/activities', (req, res) => {
  const { status } = req.query;
  let activities = getActivities();
  if (status && status !== 'all') {
    activities = activities.filter(a => a.status === status);
  }
  res.json(activities);
});

app.get('/api/activities/:id', (req, res) => {
  const activities = getActivities();
  const activity = activities.find(a => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: '活动不存在' });
  res.json(activity);
});

app.post('/api/activities/:id/join', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const activities = getActivities();
  const idx = activities.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '活动不存在' });
  const act = activities[idx];
  if (!act.participants) act.participants = [];
  if (!act.participants.includes(userId)) {
    act.participantCount++;
    act.participants.push(userId);
    saveActivities(activities);
  }
  res.json({ activity: act, hashtag: act.hashtag });
});

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ notifications: [], unreadCount: 0 });
  const notifications = getNotifications();
  const userNotifs = notifications.filter(n => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  const unreadCount = userNotifs.filter(n => !n.isRead).length;
  res.json({ notifications: userNotifs, unreadCount });
});

app.post('/api/notifications/read', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ ok: true });
  const notifications = getNotifications();
  notifications.forEach(n => {
    if (n.userId === userId) n.isRead = true;
  });
  saveNotifications(notifications);
  res.json({ ok: true });
});

// ========== CONVERSATIONS / MESSAGES ==========
app.get('/api/conversations', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json([]);
  const conversations = getConversations();
  const messages = getMessages();
  const users = getUsers();

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
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const userId = getUserId(req);
  const messages = getMessages();
  const users = getUsers();
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
  messages.forEach(m => {
    if (m.conversationId === req.params.id && m.senderId !== userId) {
      m.read = true;
    }
  });
  saveMessages(messages);
  res.json(result);
});

app.post('/api/conversations/:id/messages', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '消息不能为空' });
  const users = getUsers();
  const sender = users.find(u => u.id === userId);
  const messages = getMessages();
  const conversations = getConversations();
  const conv = conversations.find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const msg = {
    id: genId('msg'),
    conversationId: req.params.id,
    senderId: userId,
    content: content.trim(),
    createdAt: Date.now(),
    read: false
  };
  messages.push(msg);
  saveMessages(messages);
  res.json({
    ...msg,
    senderName: sender?.username,
    senderAvatar: sender?.avatar,
    sender: sender ? getUserPublic(sender) : null,
  });
});

app.post('/api/conversations/private/:userId', (req, res) => {
  const currentId = getUserId(req);
  if (!currentId) return res.status(401).json({ error: '未登录' });
  const targetUserId = req.params.userId;
  const conversations = getConversations();
  const existing = conversations.find(c => c.type === 'private' && c.participantIds.includes(currentId) && c.participantIds.includes(targetUserId));
  if (existing) return res.json(existing);
  const users = getUsers();
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
  conversations.push(conv);
  saveConversations(conversations);
  res.json(conv);
});

app.post('/api/conversations/:id/read', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ ok: true });
  const messages = getMessages();
  messages.forEach(m => {
    if (m.conversationId === req.params.id && m.senderId !== userId) {
      m.read = true;
    }
  });
  saveMessages(messages);
  res.json({ ok: true });
});

// ========== LIKED / SAVED POSTS ==========
app.get('/api/posts/liked/mine', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const posts = getPosts();
  const users = getUsers();
  const likes = getLikes();
  const collects = getCollects();
  const myLikes = likes.filter(l => l.userId === userId).map(l => l.postId);
  const likedPosts = posts.filter(p => myLikes.includes(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(likedPosts.map(p => decoratePost(p, userId, users, likes, collects)));
});

app.get('/api/posts/saved/mine', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const posts = getPosts();
  const users = getUsers();
  const likes = getLikes();
  const collects = getCollects();
  const myCollects = collects.filter(c => c.userId === userId).map(c => c.postId);
  const savedPosts = posts.filter(p => myCollects.includes(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(savedPosts.map(p => decoratePost(p, userId, users, likes, collects)));
});

// ========== FOLLOW ==========
app.post('/api/users/:id/follow', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: '未登录' });
  const users = getUsers();
  const me = users.find(u => u.id === userId);
  const targetId = req.params.id;
  const target = users.find(u => u.id === targetId);
  if (!me || !target) return res.status(404).json({ error: '用户不存在' });
  if (userId === targetId) return res.status(400).json({ error: '不能关注自己' });

  const follows = getFollows();
  const existing = follows.findIndex(f => f.followerId === userId && f.followingId === targetId);
  let isFollowing = false;
  if (existing !== -1) {
    follows.splice(existing, 1);
    me.followingCount = Math.max(0, me.followingCount - 1);
    target.followersCount = Math.max(0, target.followersCount - 1);
  } else {
    follows.push({ id: genId('follow'), followerId: userId, followingId: targetId, createdAt: Date.now() });
    me.followingCount++;
    target.followersCount++;
    isFollowing = true;
    createNotification(target.id, 'follow', '关注了你', userId, null);
  }
  saveUsers(users);
  saveFollows(follows);
  res.json({ isFollowing, followingCount: me.followingCount, followersCount: target.followersCount });
});

app.get('/api/users/:id/follow-status', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ isFollowing: false });
  const targetId = req.params.id;
  const follows = getFollows();
  const isFollowing = follows.some(f => f.followerId === userId && f.followingId === targetId);
  res.json({ isFollowing });
});

// ========== SEARCH ==========
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = getUserId(req);
    if (!q || !q.trim()) return res.json({ posts: [], users: [] });
    
    const query = q.trim();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 0);
    
    const posts = getPosts();
    const users = getUsers();
    const comments = getComments();
    const likes = getLikes();
    const collects = getCollects();
    
    function textMatches(text) {
      if (!text) return false;
      const textLower = text.toLowerCase();
      if (keywords.length === 0) return textLower.includes(queryLower);
      return keywords.every(kw => textLower.includes(kw));
    }
    
    const postIdsWithComments = new Set();
    comments.forEach(c => {
      if (textMatches(c.content)) {
        postIdsWithComments.add(c.postId);
      }
    });
    
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
    
    const postsWithAuthor = matchedPosts.map(p => decoratePost(p, currentUserId, users, likes, collects));
    res.json({ posts: postsWithAuthor, users: matchedUsers });
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: '搜索失败', posts: [], users: [] });
  }
});

// ========== UPLOAD ==========
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ========== SEED POSTS (first run) ==========
app.post('/api/seed', (req, res) => {
  const posts = getPosts();
  if (posts.length > 0) return res.json({ message: '已有帖子数据', count: posts.length });
  const users = getUsers();
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
      phone: null,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color}&color=fff&size=200&bold=true`,
      cover: `https://picsum.photos/seed/bot${name}/800/320`,
      bio: '我是机器人，分享美好生活~',
      location: '',
      wenshuCoin: 0,
      isVip: name === '文书小助手',
      vipLevel: name === '文书小助手' ? 10 : 0,
      vipExp: 0,
      vipExpiresAt: null,
      followingCount: 0,
      followersCount: 0,
      likesCount: 0,
      registerRank: 0,
      isSignedInToday: false,
      lastSignInDate: '',
      consecutiveSignDays: 0,
      createdAt: Date.now(),
      joinedQQGroup: false
    };
    users.push(bot);
    botUsers.push(bot);
  });
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

  const now = Date.now();
  const allPosts = getPosts();
  seedPosts.forEach((seed, i) => {
    const author = botUsers[Math.floor(Math.random() * botUsers.length)];
    const likeCount = Math.floor(Math.random() * 200) + 10;
    const collectCount = Math.floor(Math.random() * 50);
    allPosts.push({
      id: genId('post'),
      authorId: author.id,
      content: seed.content,
      images: seed.images,
      tags: seed.tags,
      likeCount,
      commentCount: Math.floor(Math.random() * 30),
      collectCount,
      createdAt: now - i * 3600000 * (Math.random() * 4 + 1)
    });
  });
  savePosts(allPosts);
  res.json({ message: '种子帖子已创建', count: allPosts.length });
});

app.get('/', (req, res) => {
  res.json({ message: '文书APP API is running', version: '1.1' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 文书APP后端服务运行在 port ${PORT}`);
});
