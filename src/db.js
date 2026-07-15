import {
  initPostgres, initTables, pool,
  pgGetUsers, pgSaveUser,
  pgGetPosts, pgSavePost,
  pgGetComments, pgSaveComment,
  pgGetLikes, pgSaveLike, pgDeleteLike,
  pgGetCollects, pgSaveCollect, pgDeleteCollect,
  pgGetFollows, pgSaveFollow, pgDeleteFollow,
  pgGetNotifications, pgSaveNotification,
  pgGetConversations, pgSaveConversation,
  pgGetMessages, pgSaveMessage, pgMarkMessagesRead,
  pgGetActivities, pgSaveActivity,
  pgGetRedeemCodes, pgSaveRedeemCode,
  pgGetRedeemRecords, pgSaveRedeemRecord,
  pgGetRegisterCount, pgIncrementRegisterCount,
  pgGetBlacklists, pgSaveBlacklist, pgDeleteBlacklist,
  pgSaveVerificationCode, pgFindValidVerificationCode, pgMarkVerificationCodeUsed,
  pgFindUserByPhone,
  pgGetCommentLikes, pgAddCommentLike, pgDeleteCommentLike, pgGetCommentLikeCount, pgIsCommentLikedByUser,
  pgGetGroupChats, pgGetGroupChatById, pgGetGroupChatByNumber, pgSaveGroupChat,
  pgGetGroupMembers, pgGetUserGroups, pgAddGroupMember, pgRemoveGroupMember, pgIsGroupMember, pgGenerateGroupNumber,
  pgSaveFile, pgGetFileById, pgGetFilesByPost, pgGetFilesByUploader, pgDeleteFile,
  pgIncrementFileDownload, pgGetExpiredFiles, pgGetUserTotalStorage,
  pgSaveUrlPreview, pgGetUrlPreview,
  pgSaveReport,
  pgGetTips, pgAddTip
} from './db-postgres.js';

let memUsers = [];
let memPosts = [];
let memComments = [];
let memLikes = [];
let memCollects = [];
let memFollows = [];
let memNotifications = [];
let memConversations = [];
let memMessages = [];
let memActivities = [];
let memRedeemCodes = [];
let memRedeemRecords = [];
let memBlacklists = [];
let memCommentLikes = [];
let memGroupChats = [];
let memGroupMembers = [];
let memRegisterCount = 0;
let memVerifCodes = [];
let memTips = [];
let memFiles = [];
let memUrlPreviews = [];
let memReports = [];
let useMem = false;

function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

export async function initDB() {
  initPostgres();
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!pool) {
    if (isProduction) {
      console.error('❌ FATAL: DATABASE_URL is NOT set in production environment!');
      console.error('   Data will NOT persist without a database. Set DATABASE_URL to your CockroachDB connection string in Render dashboard.');
      console.error('   Go to: Render Dashboard → Your Service → Environment → Add DATABASE_URL');
      process.exit(1);
    }
    console.log('⚠️  No DATABASE_URL - using in-memory storage (LOCAL DEV ONLY - data will not persist).');
    useMem = true;
    return;
  }
  
  try {
    const testClient = await pool.connect();
    await testClient.query('SELECT 1');
    testClient.release();
    console.log('✅ Database connection verified successfully');
  } catch (err) {
    console.error('❌ FATAL: Failed to connect to database:', err.message);
    if (isProduction) {
      process.exit(1);
    }
    console.log('⚠️  Falling back to in-memory storage for local dev...');
    useMem = true;
    return;
  }
  
  useMem = false;
  console.log('📦 Using CockroachDB/PostgreSQL database');
  await initTables();
}

export async function getUsers() { return useMem ? [...memUsers] : pgGetUsers(); }
export async function saveUsers(users) { if (useMem) { for (const u of users) await saveUser(u); } else { for (const u of users) await pgSaveUser(u); } }
export async function saveUser(user) {
  if (useMem) {
    const i = memUsers.findIndex(u => u.id === user.id);
    if (i >= 0) memUsers[i] = { ...memUsers[i], ...user }; else memUsers.push(user);
    return user;
  }
  return pgSaveUser(user);
}

export async function getPosts() { return useMem ? [...memPosts] : pgGetPosts(); }
export async function savePosts(posts) { if (useMem) { for (const p of posts) await savePost(p); } else { for (const p of posts) await pgSavePost(p); } }
export async function savePost(post) {
  if (useMem) {
    const i = memPosts.findIndex(p => p.id === post.id);
    if (i >= 0) memPosts[i] = { ...memPosts[i], ...post }; else memPosts.push(post);
    return post;
  }
  return pgSavePost(post);
}

export async function getComments() { return useMem ? [...memComments] : pgGetComments(); }
export async function saveComments(comments) { if (useMem) { for (const c of comments) await saveComment(c); } else { for (const c of comments) await pgSaveComment(c); } }
export async function saveComment(comment) {
  if (useMem) {
    const i = memComments.findIndex(c => c.id === comment.id);
    if (i >= 0) memComments[i] = { ...memComments[i], ...comment }; else memComments.push(comment);
    return comment;
  }
  return pgSaveComment(comment);
}

export async function getLikes() { return useMem ? [...memLikes] : pgGetLikes(); }
export async function saveLikes(likes) { if (useMem) { memLikes = likes; } else { for (const l of likes) await pgSaveLike(l); } }
export async function addLike(like) {
  if (useMem) { if (!memLikes.find(l => l.postId === like.postId && l.userId === like.userId)) memLikes.push(like); return like; }
  return pgSaveLike(like);
}
export async function removeLike(postId, userId) {
  if (useMem) { memLikes = memLikes.filter(l => !(l.postId === postId && l.userId === userId)); return; }
  return pgDeleteLike(postId, userId);
}

export async function getCollects() { return useMem ? [...memCollects] : pgGetCollects(); }
export async function saveCollects(collects) { if (useMem) { memCollects = collects; } else { for (const c of collects) await pgSaveCollect(c); } }
export async function addCollect(collect) {
  if (useMem) { if (!memCollects.find(c => c.postId === collect.postId && c.userId === collect.userId)) memCollects.push(collect); return collect; }
  return pgSaveCollect(collect);
}
export async function removeCollect(postId, userId) {
  if (useMem) { memCollects = memCollects.filter(c => !(c.postId === postId && c.userId === userId)); return; }
  return pgDeleteCollect(postId, userId);
}

export async function getFollows() { return useMem ? [...memFollows] : pgGetFollows(); }
export async function saveFollows(follows) { if (useMem) { memFollows = follows; } else { for (const f of follows) await pgSaveFollow(f); } }
export async function addFollow(follow) {
  if (useMem) { if (!memFollows.find(f => f.followerId === follow.followerId && f.followingId === follow.followingId)) memFollows.push(follow); return follow; }
  return pgSaveFollow(follow);
}
export async function removeFollow(followerId, followingId) {
  if (useMem) { memFollows = memFollows.filter(f => !(f.followerId === followerId && f.followingId === followingId)); return; }
  return pgDeleteFollow(followerId, followingId);
}

export async function getBlacklists() { return useMem ? [...memBlacklists] : pgGetBlacklists(); }
export async function addBlacklist(bl) {
  if (useMem) { if (!memBlacklists.find(b => b.userId === bl.userId && b.blockedUserId === bl.blockedUserId)) memBlacklists.push(bl); return bl; }
  return pgSaveBlacklist(bl);
}
export async function removeBlacklist(userId, blockedUserId) {
  if (useMem) { memBlacklists = memBlacklists.filter(b => !(b.userId === userId && b.blockedUserId === blockedUserId)); return; }
  return pgDeleteBlacklist(userId, blockedUserId);
}

export async function getActivities() { return useMem ? [...memActivities] : pgGetActivities(); }
export async function saveActivities(activities) { if (useMem) { memActivities = activities; } else { for (const a of activities) await pgSaveActivity(a); } }
export async function saveActivity(act) {
  if (useMem) { const i = memActivities.findIndex(a => a.id === act.id); if (i >= 0) memActivities[i] = { ...memActivities[i], ...act }; else memActivities.push(act); return act; }
  return pgSaveActivity(act);
}

export async function getNotifications() { return useMem ? [...memNotifications] : pgGetNotifications(); }
export async function saveNotifications(notifications) { if (useMem) { memNotifications = notifications; } else { for (const n of notifications) await pgSaveNotification(n); } }
export async function addNotification(notif) {
  if (useMem) { memNotifications.push(notif); return notif; }
  return pgSaveNotification(notif);
}
export async function markNotificationsRead(userId) {
  if (useMem) { for (const n of memNotifications) { if (n.userId === userId) n.isRead = true; } return; }
  const notifs = await pgGetNotifications();
  for (const n of notifs) {
    if (n.userId === userId && !n.isRead) { n.isRead = true; await pgSaveNotification(n); }
  }
}

export async function getConversations() { return useMem ? [...memConversations] : pgGetConversations(); }
export async function saveConversations(conversations) { if (useMem) { memConversations = conversations; } else { for (const c of conversations) await pgSaveConversation(c); } }
export async function saveConversation(conv) {
  if (useMem) { const i = memConversations.findIndex(c => c.id === conv.id); if (i >= 0) memConversations[i] = { ...memConversations[i], ...conv }; else memConversations.push(conv); return conv; }
  return pgSaveConversation(conv);
}

export async function getMessages() { return useMem ? [...memMessages] : pgGetMessages(); }
export async function saveMessages(messages) { if (useMem) { memMessages = messages; } else { for (const m of messages) await pgSaveMessage(m); } }
export async function saveMessage(msg) {
  if (useMem) { const i = memMessages.findIndex(m => m.id === msg.id); if (i >= 0) memMessages[i] = { ...memMessages[i], ...msg }; else memMessages.push(msg); return msg; }
  return pgSaveMessage(msg);
}
export async function markMessagesRead(conversationId, userId) {
  if (useMem) { for (const m of memMessages) { if (m.conversationId === conversationId && m.senderId !== userId) m.isRead = true; } return; }
  return pgMarkMessagesRead(conversationId, userId);
}

export async function getRedeemCodes() { return useMem ? [...memRedeemCodes] : pgGetRedeemCodes(); }
export async function saveRedeemCodes(codes) { if (useMem) { memRedeemCodes = codes; } else { for (const c of codes) await pgSaveRedeemCode(c); } }
export async function saveRedeemCode(code) {
  if (useMem) { const i = memRedeemCodes.findIndex(c => c.code === code.code); if (i >= 0) memRedeemCodes[i] = { ...memRedeemCodes[i], ...code }; else memRedeemCodes.push(code); return code; }
  return pgSaveRedeemCode(code);
}

export async function getRedeemRecords() { return useMem ? [...memRedeemRecords] : pgGetRedeemRecords(); }
export async function saveRedeemRecords(records) { if (useMem) { memRedeemRecords = records; } else { for (const r of records) await pgSaveRedeemRecord(r); } }
export async function addRedeemRecord(rec) {
  if (useMem) { memRedeemRecords.push(rec); return rec; }
  return pgSaveRedeemRecord(rec);
}

export async function getRegisterCount() { return useMem ? memRegisterCount : pgGetRegisterCount(); }
export async function incrementRegisterCount() {
  if (useMem) { memRegisterCount++; return memRegisterCount; }
  return pgIncrementRegisterCount();
}

export async function saveVerificationCode(vc) {
  if (useMem) { memVerifCodes.push(vc); return vc; }
  return pgSaveVerificationCode(vc);
}
export async function findValidVerificationCode(phone, code, purpose) {
  if (useMem) {
    const now = Date.now();
    return memVerifCodes.find(v => v.phone === phone && v.code === code && v.purpose === purpose && !v.used && v.expiresAt > now) || null;
  }
  return pgFindValidVerificationCode(phone, code, purpose);
}
export async function markVerificationCodeUsed(id) {
  if (useMem) { const v = memVerifCodes.find(v => v.id === id); if (v) v.used = true; return; }
  return pgMarkVerificationCodeUsed(id);
}
export async function findUserByPhone(phone) {
  if (useMem) { return memUsers.find(u => u.phone === phone) || null; }
  return pgFindUserByPhone(phone);
}

export async function getCommentLikes() { return useMem ? [...memCommentLikes] : pgGetCommentLikes(); }
export async function addCommentLike(like) {
  if (useMem) { if (!memCommentLikes.find(l => l.commentId === like.commentId && l.userId === like.userId)) memCommentLikes.push(like); return like; }
  return pgAddCommentLike(like);
}
export async function removeCommentLike(commentId, userId) {
  if (useMem) { memCommentLikes = memCommentLikes.filter(l => !(l.commentId === commentId && l.userId === userId)); return; }
  return pgDeleteCommentLike(commentId, userId);
}
export async function isCommentLikedByUser(commentId, userId) {
  if (useMem) return memCommentLikes.some(l => l.commentId === commentId && l.userId === userId);
  return pgIsCommentLikedByUser(commentId, userId);
}
export async function getCommentLikeCount(commentId) {
  if (useMem) return memCommentLikes.filter(l => l.commentId === commentId).length;
  return pgGetCommentLikeCount(commentId);
}

export async function getGroupChats() { return useMem ? [...memGroupChats] : pgGetGroupChats(); }
export async function getGroupChatById(id) {
  if (useMem) return memGroupChats.find(g => g.id === id) || null;
  return pgGetGroupChatById(id);
}
export async function getGroupChatByNumber(num) {
  if (useMem) return memGroupChats.find(g => g.groupNumber === num) || null;
  return pgGetGroupChatByNumber(num);
}
export async function saveGroupChat(gc) {
  if (useMem) { const i = memGroupChats.findIndex(g => g.id === gc.id); if (i >= 0) memGroupChats[i] = { ...memGroupChats[i], ...gc }; else memGroupChats.push(gc); return gc; }
  return pgSaveGroupChat(gc);
}
export async function getGroupMembers(groupId) {
  if (useMem) return memGroupMembers.filter(m => m.groupId === groupId);
  return pgGetGroupMembers(groupId);
}
export async function getUserGroups(userId) {
  if (useMem) {
    const gids = memGroupMembers.filter(m => m.userId === userId).map(m => m.groupId);
    return memGroupChats.filter(g => gids.includes(g.id));
  }
  return pgGetUserGroups(userId);
}
export async function addGroupMember(member) {
  if (useMem) { if (!memGroupMembers.find(m => m.groupId === member.groupId && m.userId === member.userId)) memGroupMembers.push(member); return member; }
  return pgAddGroupMember(member);
}
export async function removeGroupMember(groupId, userId) {
  if (useMem) { memGroupMembers = memGroupMembers.filter(m => !(m.groupId === groupId && m.userId === userId)); return; }
  return pgRemoveGroupMember(groupId, userId);
}
export async function isGroupMember(groupId, userId) {
  if (useMem) return memGroupMembers.some(m => m.groupId === groupId && m.userId === userId);
  return pgIsGroupMember(groupId, userId);
}
export async function generateGroupNumber() {
  if (useMem) {
    for (let i = 0; i < 100; i++) {
      const num = Math.floor(100000 + Math.random() * 900000).toString();
      if (!memGroupChats.find(g => g.groupNumber === num)) return num;
    }
    return Math.floor(1000000 + Math.random() * 9000000).toString();
  }
  return pgGenerateGroupNumber();
}

export async function getTips() { return useMem ? [...memTips] : pgGetTips(); }
export async function addTip(tip) {
  if (useMem) { memTips.push(tip); return tip; }
  return pgAddTip(tip);
}

export async function saveFile(file) {
  if (useMem) {
    const i = memFiles.findIndex(f => f.id === file.id);
    if (i >= 0) memFiles[i] = { ...memFiles[i], ...file }; else memFiles.push(file);
    return file;
  }
  return pgSaveFile(file);
}
export async function getFileById(id) {
  if (useMem) return memFiles.find(f => f.id === id) || null;
  return pgGetFileById(id);
}
export async function getFilesByPost(postId) {
  if (useMem) return memFiles.filter(f => f.postId === postId);
  return pgGetFilesByPost(postId);
}
export async function getFilesByUploader(uploaderId) {
  if (useMem) return memFiles.filter(f => f.uploaderId === uploaderId);
  return pgGetFilesByUploader(uploaderId);
}
export async function deleteFile(id) {
  if (useMem) { memFiles = memFiles.filter(f => f.id !== id); return; }
  return pgDeleteFile(id);
}
export async function incrementFileDownload(id) {
  if (useMem) {
    const f = memFiles.find(f => f.id === id);
    if (f) f.downloadCount = (f.downloadCount || 0) + 1;
    return;
  }
  return pgIncrementFileDownload(id);
}
export async function getExpiredFiles() {
  if (useMem) { const now = Date.now(); return memFiles.filter(f => f.expiresAt && f.expiresAt < now && !f.isPermanent); }
  return pgGetExpiredFiles();
}
export async function getUserTotalStorage(uploaderId) {
  if (useMem) return memFiles.filter(f => f.uploaderId === uploaderId).reduce((s, f) => s + (f.size || 0), 0);
  return pgGetUserTotalStorage(uploaderId);
}

export async function saveUrlPreview(preview) {
  if (useMem) {
    const i = memUrlPreviews.findIndex(p => p.url === preview.url);
    if (i >= 0) memUrlPreviews[i] = { ...preview }; else memUrlPreviews.push(preview);
    return preview;
  }
  return pgSaveUrlPreview(preview);
}
export async function getUrlPreview(url) {
  if (useMem) return memUrlPreviews.find(p => p.url === url) || null;
  return pgGetUrlPreview(url);
}

export async function saveReport(report) {
  if (useMem) { memReports.push(report); return report; }
  return pgSaveReport(report);
}

export async function seedInitialData() {
  if (useMem) return;
  const activities = await getActivities();
  if (activities.length === 0) {
    const now = Date.now();
    const seedActivities = [
      {
        id: 'act_1', title: '夏日生活记录', cover: 'https://picsum.photos/seed/act1/800/450',
        description: '分享你的夏日生活瞬间，带话题#夏日生活 发布帖子即可参与！',
        hashtag: '夏日生活', rewardCoins: 500, participantCount: 1234, participants: [],
        status: 'active', startDate: now - 86400000 * 3, endDate: now + 86400000 * 7,
        rules: ['带话题#夏日生活 发布原创帖子', '内容需与夏日生活相关', '活动结束后评选10名优质内容，每人获得500文书币']
      },
      {
        id: 'act_2', title: '日常打卡挑战', cover: 'https://picsum.photos/seed/act2/800/450',
        description: '连续7天发布日常帖子，坚持打卡赢取文书币奖励！',
        hashtag: '日常打卡', rewardCoins: 200, participantCount: 5678, participants: [],
        status: 'active', startDate: now - 86400000, endDate: now + 86400000 * 14,
        rules: ['带话题#日常打卡 连续7天发帖', '每天至少发布1篇帖子', '完成打卡即可获得200文书币']
      }
    ];
    await saveActivities(seedActivities);
  }

  const redeemCodes = await getRedeemCodes();
  const now = Date.now();
  const allCodes = [
    { code: 'WENSHU2024', coinValue: 200, rewardType: 'coin', description: '新用户欢迎礼包', validUntil: now + 86400000 * 365, usedBy: [] },
    { code: 'QQGROUP702', coinValue: 300, rewardType: 'coin', description: '加入QQ群专属奖励', validUntil: now + 86400000 * 365, usedBy: [] },
    { code: 'WELCOME100', coinValue: 100, rewardType: 'coin', description: '欢迎使用文书APP', validUntil: now + 86400000 * 365, usedBy: [] },
  ];
  for (const c of allCodes) {
    const existing = redeemCodes.find(r => r.code.toUpperCase() === c.code.toUpperCase());
    if (!existing) await saveRedeemCode(c);
  }
}

export const usePostgres = true;
export { pool };
