import pg from 'pg';
const { Pool } = pg;

let pool = null;

export function initPostgres() {
  if (!process.env.DATABASE_URL) {
    console.warn('No DATABASE_URL found - database functions will return empty/default values. Set DATABASE_URL to connect to CockroachDB.');
    return null;
  }
  
  let connectionString = process.env.DATABASE_URL;
  if (connectionString.includes('sslmode=verify-full')) {
    connectionString = connectionString.replace('sslmode=verify-full', 'sslmode=require');
  }
  
  pool = new Pool({
    connectionString,
    ssl: (process.env.DATABASE_URL.includes('cockroachlabs') || process.env.DATABASE_URL.includes('neon.tech') || process.env.DATABASE_URL.includes('render.com'))
      ? { rejectUnauthorized: false } 
      : false,
  });
  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });
  return pool;
}

export async function initTables() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT UNIQUE,
        avatar TEXT,
        cover TEXT,
        bio TEXT DEFAULT '',
        location TEXT DEFAULT '',
        wenshu_coin INTEGER DEFAULT 0,
        is_vip BOOLEAN DEFAULT false,
        vip_level INTEGER DEFAULT 0,
        vip_exp INTEGER DEFAULT 0,
        vip_expires_at BIGINT,
        following_count INTEGER DEFAULT 0,
        followers_count INTEGER DEFAULT 0,
        likes_count INTEGER DEFAULT 0,
        register_rank INTEGER DEFAULT 0,
        is_signed_in_today BOOLEAN DEFAULT false,
        last_sign_in_date TEXT DEFAULT '',
        consecutive_sign_days INTEGER DEFAULT 0,
        created_at BIGINT,
        joined_qq_group BOOLEAN DEFAULT false,
        is_admin BOOLEAN DEFAULT false,
        is_banned BOOLEAN DEFAULT false,
        ban_until BIGINT,
        ban_reason TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        title TEXT DEFAULT '',
        content TEXT NOT NULL,
        images JSONB DEFAULT '[]'::jsonb,
        tags JSONB DEFAULT '[]'::jsonb,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        collect_count INTEGER DEFAULT 0,
        coin_count INTEGER DEFAULT 0,
        tipped_by JSONB DEFAULT '[]'::jsonb,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT NOT NULL,
        like_count INTEGER DEFAULT 0,
        reply_to_id TEXT,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at BIGINT,
        UNIQUE(post_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS collects (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at BIGINT,
        UNIQUE(post_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id TEXT PRIMARY KEY,
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at BIGINT,
        UNIQUE(follower_id, following_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        from_user_id TEXT,
        post_id TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT DEFAULT 'private',
        name TEXT,
        avatar TEXT,
        participant_ids JSONB DEFAULT '[]'::jsonb,
        last_message TEXT DEFAULT '',
        last_message_time BIGINT,
        unread_count INTEGER DEFAULT 0,
        is_system BOOLEAN DEFAULT false
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        cover TEXT,
        description TEXT,
        hashtag TEXT,
        reward_coins INTEGER DEFAULT 0,
        participant_count INTEGER DEFAULT 0,
        participants JSONB DEFAULT '[]'::jsonb,
        status TEXT DEFAULT 'active',
        start_date BIGINT,
        end_date BIGINT,
        rules JSONB DEFAULT '[]'::jsonb
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS redeem_codes (
        code TEXT PRIMARY KEY,
        coin_value INTEGER DEFAULT 0,
        reward_type TEXT DEFAULT 'coin',
        description TEXT,
        valid_until BIGINT,
        used_by JSONB DEFAULT '[]'::jsonb
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS redeem_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        coin_value INTEGER DEFAULT 0,
        reward_type TEXT DEFAULT 'coin',
        redeemed_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blacklists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        created_at BIGINT,
        UNIQUE(user_id, blocked_user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comment_likes (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at BIGINT,
        UNIQUE(comment_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_chats (
        id TEXT PRIMARY KEY,
        group_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        owner_id TEXT NOT NULL,
        join_code TEXT NOT NULL,
        join_code_expires_at BIGINT,
        last_message TEXT DEFAULT '',
        last_message_time BIGINT,
        member_count INTEGER DEFAULT 1,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at BIGINT,
        UNIQUE(group_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        uploader_id TEXT NOT NULL,
        post_id TEXT,
        original_name TEXT NOT NULL,
        stored_key TEXT NOT NULL,
        mime_type TEXT DEFAULT 'application/octet-stream',
        size BIGINT DEFAULT 0,
        storage_type TEXT DEFAULT 'local',
        expires_at BIGINT,
        is_permanent BOOLEAN DEFAULT false,
        download_count INTEGER DEFAULT 0,
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS url_previews (
        url TEXT PRIMARY KEY,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        favicon TEXT,
        site_name TEXT DEFAULT '',
        fetched_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_at BIGINT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tips (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        amount INTEGER DEFAULT 0,
        created_at BIGINT
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_collects_post ON collects(post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_collects_user ON collects(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blacklists_user ON blacklists(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blacklists_blocked ON blacklists(blocked_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_phone ON verification_codes(phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_expires ON verification_codes(expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_chats_owner ON group_chats(owner_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_chats_number ON group_chats(group_number)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_post ON files(post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_url_previews_url ON url_previews(url)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tips_from ON tips(from_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tips_to ON tips(to_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tips_post ON tips(post_id)`);

    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS tipped_by JSONB DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS title TEXT DEFAULT ''`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS location TEXT DEFAULT ''`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_long_post BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS url_previews JSONB DEFAULT '[]'::jsonb`);

    const userAlterColumns = [
      'phone TEXT UNIQUE',
      'avatar TEXT',
      'cover TEXT',
      'bio TEXT DEFAULT \'\'',
      'location TEXT DEFAULT \'\'',
      'wenshu_coin INTEGER DEFAULT 0',
      'is_vip BOOLEAN DEFAULT false',
      'vip_level INTEGER DEFAULT 0',
      'vip_exp INTEGER DEFAULT 0',
      'vip_expires_at BIGINT',
      'following_count INTEGER DEFAULT 0',
      'followers_count INTEGER DEFAULT 0',
      'likes_count INTEGER DEFAULT 0',
      'register_rank INTEGER DEFAULT 0',
      'is_signed_in_today BOOLEAN DEFAULT false',
      'last_sign_in_date TEXT DEFAULT \'\'',
      'consecutive_sign_days INTEGER DEFAULT 0',
      'created_at BIGINT',
      'joined_qq_group BOOLEAN DEFAULT false',
      'is_admin BOOLEAN DEFAULT false',
      'is_banned BOOLEAN DEFAULT false',
      'ban_until BIGINT',
      'ban_reason TEXT'
    ];
    for (const col of userAlterColumns) {
      const colName = col.split(' ')[0];
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`);
      } catch (e) {
        console.warn(`Column ${colName} may already exist:`, e.message);
      }
    }

    console.log('✅ PostgreSQL tables initialized');
  } finally {
    client.release();
  }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    phone: row.phone,
    avatar: row.avatar,
    cover: row.cover,
    bio: row.bio || '',
    location: row.location || '',
    wenshuCoin: row.wenshu_coin || 0,
    isVip: row.is_vip || false,
    vipLevel: row.vip_level || 0,
    vipExp: row.vip_exp || 0,
    vipExpiresAt: row.vip_expires_at,
    followingCount: row.following_count || 0,
    followersCount: row.followers_count || 0,
    likesCount: row.likes_count || 0,
    registerRank: row.register_rank || 0,
    isSignedInToday: row.is_signed_in_today || false,
    lastSignInDate: row.last_sign_in_date || '',
    consecutiveSignDays: row.consecutive_sign_days || 0,
    createdAt: row.created_at,
    joinedQQGroup: row.joined_qq_group || false,
    isAdmin: row.is_admin || false,
    isBanned: row.is_banned || false,
    banUntil: row.ban_until,
    banReason: row.ban_reason,
  };
}

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title || '',
    content: row.content,
    images: row.images || [],
    videos: row.videos || [],
    files: row.files || [],
    tags: row.tags || [],
    likeCount: row.like_count || 0,
    commentCount: row.comment_count || 0,
    collectCount: row.collect_count || 0,
    coinCount: row.coin_count || 0,
    tippedBy: row.tipped_by || [],
    location: row.location || '',
    isLongPost: row.is_long_post || false,
    urlPreviews: row.url_previews || [],
    createdAt: Math.floor(Number(row.created_at) || Date.now()),
  };
}

function rowToComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    content: row.content,
    likeCount: row.like_count || 0,
    replyToId: row.reply_to_id,
    createdAt: Math.floor(Number(row.created_at) || Date.now()),
  };
}

function rowToLike(row) {
  if (!row) return null;
  return { id: row.id, postId: row.post_id, userId: row.user_id, createdAt: Math.floor(Number(row.created_at) || Date.now()) };
}

function rowToCollect(row) {
  if (!row) return null;
  return { id: row.id, postId: row.post_id, userId: row.user_id, createdAt: Math.floor(Number(row.created_at) || Date.now()) };
}

function rowToFollow(row) {
  if (!row) return null;
  return { id: row.id, followerId: row.follower_id, followingId: row.following_id, createdAt: Math.floor(Number(row.created_at) || Date.now()) };
}

function rowToNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    fromUserId: row.from_user_id,
    postId: row.post_id,
    isRead: row.is_read,
    createdAt: Math.floor(Number(row.created_at) || Date.now()),
  };
}

function rowToConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    avatar: row.avatar,
    participantIds: row.participant_ids || [],
    lastMessage: row.last_message,
    lastMessageTime: row.last_message_time ? Math.floor(Number(row.last_message_time)) : null,
    unreadCount: row.unread_count,
    isSystem: row.is_system,
  };
}

function rowToMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    read: row.read,
    createdAt: Math.floor(Number(row.created_at) || Date.now()),
  };
}

function rowToActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    description: row.description,
    hashtag: row.hashtag,
    rewardCoins: row.reward_coins,
    participantCount: row.participant_count,
    participants: row.participants || [],
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    rules: row.rules || [],
  };
}

function rowToRedeemCode(row) {
  if (!row) return null;
  return {
    code: row.code,
    coinValue: row.coin_value,
    rewardType: row.reward_type,
    description: row.description,
    validUntil: row.valid_until,
    usedBy: row.used_by || [],
  };
}

function rowToRedeemRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    code: row.code,
    coinValue: row.coin_value,
    rewardType: row.reward_type,
    redeemedAt: row.redeemed_at,
  };
}

function rowToBlacklist(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    blockedUserId: row.blocked_user_id,
    createdAt: row.created_at,
  };
}

export async function pgGetUsers() {
  const res = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
  return res.rows.map(rowToUser);
}

export async function pgSaveUser(user) {
  await pool.query(`
    INSERT INTO users (id, username, password, phone, avatar, cover, bio, location, wenshu_coin, is_vip, vip_level, vip_exp, vip_expires_at, following_count, followers_count, likes_count, register_rank, is_signed_in_today, last_sign_in_date, consecutive_sign_days, created_at, joined_qq_group, is_admin, is_banned, ban_until, ban_reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username, password = EXCLUDED.password, phone = EXCLUDED.phone, avatar = EXCLUDED.avatar, cover = EXCLUDED.cover,
      bio = EXCLUDED.bio, location = EXCLUDED.location, wenshu_coin = EXCLUDED.wenshu_coin, is_vip = EXCLUDED.is_vip,
      vip_level = EXCLUDED.vip_level, vip_exp = EXCLUDED.vip_exp, vip_expires_at = EXCLUDED.vip_expires_at,
      following_count = EXCLUDED.following_count, followers_count = EXCLUDED.followers_count, likes_count = EXCLUDED.likes_count,
      register_rank = EXCLUDED.register_rank, is_signed_in_today = EXCLUDED.is_signed_in_today,
      last_sign_in_date = EXCLUDED.last_sign_in_date, consecutive_sign_days = EXCLUDED.consecutive_sign_days,
      joined_qq_group = EXCLUDED.joined_qq_group, is_admin = EXCLUDED.is_admin, is_banned = EXCLUDED.is_banned,
      ban_until = EXCLUDED.ban_until, ban_reason = EXCLUDED.ban_reason
  `, [
    user.id, user.username, user.password, user.phone, user.avatar, user.cover, user.bio || '', user.location || '',
    user.wenshuCoin || 0, user.isVip || false, user.vipLevel || 0, user.vipExp || 0, user.vipExpiresAt,
    user.followingCount || 0, user.followersCount || 0, user.likesCount || 0, user.registerRank || 0,
    user.isSignedInToday || false, user.lastSignInDate || '', user.consecutiveSignDays || 0,
    user.createdAt, user.joinedQQGroup || false, user.isAdmin || false, user.isBanned || false,
    user.banUntil || null, user.banReason || null
  ]);
}

export async function pgGetPosts() {
  const res = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
  return res.rows.map(rowToPost);
}

export async function pgSavePost(post) {
  await pool.query(`
    INSERT INTO posts (id, author_id, title, content, images, videos, files, tags, like_count, comment_count, collect_count, coin_count, tipped_by, location, is_long_post, url_previews, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, content = EXCLUDED.content, images = EXCLUDED.images, videos = EXCLUDED.videos,
      files = EXCLUDED.files, tags = EXCLUDED.tags,
      like_count = EXCLUDED.like_count, comment_count = EXCLUDED.comment_count, collect_count = EXCLUDED.collect_count,
      coin_count = EXCLUDED.coin_count, tipped_by = EXCLUDED.tipped_by, location = EXCLUDED.location,
      is_long_post = EXCLUDED.is_long_post, url_previews = EXCLUDED.url_previews
  `, [
    post.id, post.authorId, post.title || '', post.content,
    JSON.stringify(post.images || []), JSON.stringify(post.videos || []), JSON.stringify(post.files || []),
    JSON.stringify(post.tags || []),
    post.likeCount || 0, post.commentCount || 0, post.collectCount || 0,
    post.coinCount || 0, JSON.stringify(post.tippedBy || []), post.location || '',
    post.isLongPost || false, JSON.stringify(post.urlPreviews || []), post.createdAt
  ]);
}

export async function pgGetComments() {
  const res = await pool.query('SELECT * FROM comments ORDER BY created_at ASC');
  return res.rows.map(rowToComment);
}

export async function pgSaveComment(comment) {
  await pool.query(`
    INSERT INTO comments (id, post_id, author_id, content, like_count, reply_to_id, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, like_count = EXCLUDED.like_count
  `, [comment.id, comment.postId, comment.authorId, comment.content, comment.likeCount || 0, comment.replyToId, comment.createdAt]);
}

export async function pgGetLikes() {
  const res = await pool.query('SELECT * FROM likes');
  return res.rows.map(rowToLike);
}

export async function pgSaveLike(like) {
  await pool.query(`
    INSERT INTO likes (id, post_id, user_id, created_at)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (post_id, user_id) DO NOTHING
  `, [like.id, like.postId, like.userId, like.createdAt]);
}

export async function pgDeleteLike(postId, userId) {
  await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
}

export async function pgGetCollects() {
  const res = await pool.query('SELECT * FROM collects');
  return res.rows.map(rowToCollect);
}

export async function pgSaveCollect(collect) {
  await pool.query(`
    INSERT INTO collects (id, post_id, user_id, created_at)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (post_id, user_id) DO NOTHING
  `, [collect.id, collect.postId, collect.userId, collect.createdAt]);
}

export async function pgDeleteCollect(postId, userId) {
  await pool.query('DELETE FROM collects WHERE post_id = $1 AND user_id = $2', [postId, userId]);
}

export async function pgGetFollows() {
  const res = await pool.query('SELECT * FROM follows');
  return res.rows.map(rowToFollow);
}

export async function pgSaveFollow(follow) {
  await pool.query(`
    INSERT INTO follows (id, follower_id, following_id, created_at)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (follower_id, following_id) DO NOTHING
  `, [follow.id, follow.followerId, follow.followingId, follow.createdAt]);
}

export async function pgDeleteFollow(followerId, followingId) {
  await pool.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [followerId, followingId]);
}

export async function pgGetNotifications() {
  const res = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
  return res.rows.map(rowToNotification);
}

export async function pgSaveNotification(notif) {
  await pool.query(`
    INSERT INTO notifications (id, user_id, type, content, from_user_id, post_id, is_read, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read
  `, [notif.id, notif.userId, notif.type, notif.content, notif.fromUserId, notif.postId, notif.isRead, notif.createdAt]);
}

export async function pgGetConversations() {
  const res = await pool.query('SELECT * FROM conversations');
  return res.rows.map(rowToConversation);
}

export async function pgSaveConversation(conv) {
  await pool.query(`
    INSERT INTO conversations (id, type, name, avatar, participant_ids, last_message, last_message_time, unread_count, is_system)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO UPDATE SET
      last_message = EXCLUDED.last_message, last_message_time = EXCLUDED.last_message_time, unread_count = EXCLUDED.unread_count
  `, [conv.id, conv.type, conv.name, conv.avatar, JSON.stringify(conv.participantIds || []),
       conv.lastMessage, conv.lastMessageTime, conv.unreadCount, conv.isSystem || false]);
}

export async function pgGetMessages() {
  const res = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
  return res.rows.map(rowToMessage);
}

export async function pgSaveMessage(msg) {
  await pool.query(`
    INSERT INTO messages (id, conversation_id, sender_id, content, read, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE SET read = EXCLUDED.read
  `, [msg.id, msg.conversationId, msg.senderId, msg.content, msg.read || false, msg.createdAt]);
}

export async function pgMarkMessagesRead(conversationId, userId) {
  await pool.query(`
    UPDATE messages SET read = true
    WHERE conversation_id = $1 AND sender_id != $2
  `, [conversationId, userId]);
}

export async function pgGetActivities() {
  const res = await pool.query('SELECT * FROM activities');
  return res.rows.map(rowToActivity);
}

export async function pgSaveActivity(act) {
  await pool.query(`
    INSERT INTO activities (id, title, cover, description, hashtag, reward_coins, participant_count, participants, status, start_date, end_date, rules)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET
      participant_count = EXCLUDED.participant_count, participants = EXCLUDED.participants, status = EXCLUDED.status
  `, [act.id, act.title, act.cover, act.description, act.hashtag, act.rewardCoins,
       act.participantCount, JSON.stringify(act.participants || []), act.status,
       act.startDate, act.endDate, JSON.stringify(act.rules || [])]);
}

export async function pgGetRedeemCodes() {
  const res = await pool.query('SELECT * FROM redeem_codes');
  return res.rows.map(rowToRedeemCode);
}

export async function pgSaveRedeemCode(code) {
  await pool.query(`
    INSERT INTO redeem_codes (code, coin_value, reward_type, description, valid_until, used_by)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (code) DO UPDATE SET
      coin_value = EXCLUDED.coin_value, reward_type = EXCLUDED.reward_type,
      description = EXCLUDED.description, valid_until = EXCLUDED.valid_until, used_by = EXCLUDED.used_by
  `, [code.code, code.coinValue, code.rewardType, code.description, code.validUntil, JSON.stringify(code.usedBy || [])]);
}

export async function pgGetRedeemRecords() {
  const res = await pool.query('SELECT * FROM redeem_records ORDER BY redeemed_at DESC');
  return res.rows.map(rowToRedeemRecord);
}

export async function pgSaveRedeemRecord(rec) {
  await pool.query(`
    INSERT INTO redeem_records (id, user_id, code, coin_value, reward_type, redeemed_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO NOTHING
  `, [rec.id, rec.userId, rec.code, rec.coinValue, rec.rewardType, rec.redeemedAt]);
}

export async function pgGetRegisterCount() {
  const res = await pool.query("SELECT value FROM meta WHERE key = 'registerCount'");
  if (res.rows.length === 0) return 0;
  return parseInt(res.rows[0].value) || 0;
}

export async function pgIncrementRegisterCount() {
  const count = (await pgGetRegisterCount()) + 1;
  await pool.query(`
    INSERT INTO meta (key, value) VALUES ('registerCount', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [count.toString()]);
  return count;
}

export async function pgGetBlacklists() {
  const res = await pool.query('SELECT * FROM blacklists');
  return res.rows.map(rowToBlacklist);
}

export async function pgSaveBlacklist(bl) {
  await pool.query(`
    INSERT INTO blacklists (id, user_id, blocked_user_id, created_at)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id, blocked_user_id) DO NOTHING
  `, [bl.id, bl.userId, bl.blockedUserId, bl.createdAt]);
}

export async function pgDeleteBlacklist(userId, blockedUserId) {
  await pool.query('DELETE FROM blacklists WHERE user_id = $1 AND blocked_user_id = $2', [userId, blockedUserId]);
}

export async function pgSaveVerificationCode(vc) {
  await pool.query(`
    INSERT INTO verification_codes (id, phone, code, purpose, expires_at, used, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [vc.id, vc.phone, vc.code, vc.purpose, vc.expiresAt, vc.used || false, vc.createdAt]);
}

export async function pgFindValidVerificationCode(phone, code, purpose) {
  const res = await pool.query(`
    SELECT * FROM verification_codes 
    WHERE phone = $1 AND code = $2 AND purpose = $3 AND used = false AND expires_at > $4
    ORDER BY created_at DESC LIMIT 1
  `, [phone, code, purpose, Date.now()]);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    phone: row.phone,
    code: row.code,
    purpose: row.purpose,
    expiresAt: row.expires_at,
    used: row.used,
    createdAt: row.created_at,
  };
}

export async function pgMarkVerificationCodeUsed(id) {
  await pool.query('UPDATE verification_codes SET used = true WHERE id = $1', [id]);
}

export async function pgFindUserByPhone(phone) {
  const res = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  if (res.rows.length === 0) return null;
  return rowToUser(res.rows[0]);
}

function rowToCommentLike(row) {
  if (!row) return null;
  return { id: row.id, commentId: row.comment_id, userId: row.user_id, createdAt: row.created_at };
}

function rowToGroupChat(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupNumber: row.group_number,
    name: row.name,
    avatar: row.avatar,
    ownerId: row.owner_id,
    joinCode: row.join_code,
    joinCodeExpiresAt: row.join_code_expires_at,
    lastMessage: row.last_message || '',
    lastMessageTime: row.last_message_time,
    memberCount: row.member_count || 1,
    createdAt: row.created_at
  };
}

function rowToGroupMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role || 'member',
    joinedAt: row.joined_at
  };
}

export async function pgGetCommentLikes() {
  const res = await pool.query('SELECT * FROM comment_likes');
  return res.rows.map(rowToCommentLike);
}

export async function pgAddCommentLike(like) {
  await pool.query(`
    INSERT INTO comment_likes (id, comment_id, user_id, created_at)
    VALUES ($1,$2,$3,$4) ON CONFLICT (comment_id, user_id) DO NOTHING
  `, [like.id, like.commentId, like.userId, like.createdAt]);
}

export async function pgDeleteCommentLike(commentId, userId) {
  await pool.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
}

export async function pgGetCommentLikeCount(commentId) {
  const res = await pool.query('SELECT COUNT(*) FROM comment_likes WHERE comment_id = $1', [commentId]);
  return parseInt(res.rows[0].count) || 0;
}

export async function pgIsCommentLikedByUser(commentId, userId) {
  const res = await pool.query('SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
  return res.rows.length > 0;
}

export async function pgGetGroupChats() {
  const res = await pool.query('SELECT * FROM group_chats ORDER BY last_message_time DESC NULLS LAST');
  return res.rows.map(rowToGroupChat);
}

export async function pgGetGroupChatById(id) {
  const res = await pool.query('SELECT * FROM group_chats WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  return rowToGroupChat(res.rows[0]);
}

export async function pgGetGroupChatByNumber(number) {
  const res = await pool.query('SELECT * FROM group_chats WHERE group_number = $1', [number]);
  if (res.rows.length === 0) return null;
  return rowToGroupChat(res.rows[0]);
}

export async function pgSaveGroupChat(gc) {
  await pool.query(`
    INSERT INTO group_chats (id, group_number, name, avatar, owner_id, join_code, join_code_expires_at, last_message, last_message_time, member_count, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, avatar = EXCLUDED.avatar, join_code = EXCLUDED.join_code,
      join_code_expires_at = EXCLUDED.join_code_expires_at, last_message = EXCLUDED.last_message,
      last_message_time = EXCLUDED.last_message_time, member_count = EXCLUDED.member_count
  `, [gc.id, gc.groupNumber, gc.name, gc.avatar, gc.ownerId, gc.joinCode, gc.joinCodeExpiresAt,
       gc.lastMessage || '', gc.lastMessageTime, gc.memberCount || 1, gc.createdAt]);
}

export async function pgGetGroupMembers(groupId) {
  const res = await pool.query('SELECT * FROM group_members WHERE group_id = $1', [groupId]);
  return res.rows.map(rowToGroupMember);
}

export async function pgGetUserGroups(userId) {
  const res = await pool.query(`
    SELECT gc.* FROM group_chats gc
    JOIN group_members gm ON gc.id = gm.group_id
    WHERE gm.user_id = $1 ORDER BY gc.last_message_time DESC NULLS LAST
  `, [userId]);
  return res.rows.map(rowToGroupChat);
}

export async function pgAddGroupMember(member) {
  await pool.query(`
    INSERT INTO group_members (id, group_id, user_id, role, joined_at)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (group_id, user_id) DO NOTHING
  `, [member.id, member.groupId, member.userId, member.role || 'member', member.joinedAt]);
}

export async function pgRemoveGroupMember(groupId, userId) {
  await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
}

export async function pgIsGroupMember(groupId, userId) {
  const res = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return res.rows.length > 0;
}

export async function pgGenerateGroupNumber() {
  for (let i = 0; i < 10; i++) {
    const num = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await pgGetGroupChatByNumber(num);
    if (!existing) return num;
  }
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}

function rowToFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    uploaderId: row.uploader_id,
    postId: row.post_id,
    originalName: row.original_name,
    storedKey: row.stored_key,
    mimeType: row.mime_type || 'application/octet-stream',
    size: parseInt(row.size) || 0,
    storageType: row.storage_type || 'local',
    expiresAt: row.expires_at ? Math.floor(Number(row.expires_at)) : null,
    isPermanent: row.is_permanent || false,
    downloadCount: row.download_count || 0,
    createdAt: Math.floor(Number(row.created_at) || Date.now()),
  };
}

function rowToUrlPreview(row) {
  if (!row) return null;
  return {
    url: row.url,
    title: row.title || '',
    description: row.description || '',
    favicon: row.favicon || null,
    siteName: row.site_name || '',
    fetchedAt: row.fetched_at ? Math.floor(Number(row.fetched_at)) : null,
  };
}

export async function pgSaveFile(file) {
  await pool.query(`
    INSERT INTO files (id, uploader_id, post_id, original_name, stored_key, mime_type, size, storage_type, expires_at, is_permanent, download_count, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET
      post_id = EXCLUDED.post_id, download_count = EXCLUDED.download_count
  `, [file.id, file.uploaderId, file.postId || null, file.originalName, file.storedKey,
       file.mimeType || 'application/octet-stream', file.size || 0, file.storageType || 'local',
       file.expiresAt || null, file.isPermanent || false, file.downloadCount || 0, file.createdAt || Date.now()]);
}

export async function pgGetFileById(id) {
  const res = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  return rowToFile(res.rows[0]);
}

export async function pgGetFilesByPost(postId) {
  const res = await pool.query('SELECT * FROM files WHERE post_id = $1 ORDER BY created_at ASC', [postId]);
  return res.rows.map(rowToFile);
}

export async function pgGetFilesByUploader(uploaderId) {
  const res = await pool.query('SELECT * FROM files WHERE uploader_id = $1 ORDER BY created_at DESC', [uploaderId]);
  return res.rows.map(rowToFile);
}

export async function pgDeleteFile(id) {
  await pool.query('DELETE FROM files WHERE id = $1', [id]);
}

export async function pgIncrementFileDownload(id) {
  await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [id]);
}

export async function pgGetExpiredFiles() {
  const now = Date.now();
  const res = await pool.query('SELECT * FROM files WHERE expires_at IS NOT NULL AND expires_at < $1 AND is_permanent = false', [now]);
  return res.rows.map(rowToFile);
}

export async function pgGetUserTotalStorage(uploaderId) {
  const res = await pool.query('SELECT COALESCE(SUM(size), 0) as total FROM files WHERE uploader_id = $1', [uploaderId]);
  return parseInt(res.rows[0].total) || 0;
}

export async function pgSaveUrlPreview(preview) {
  await pool.query(`
    INSERT INTO url_previews (url, title, description, favicon, site_name, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (url) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description,
      favicon = EXCLUDED.favicon, site_name = EXCLUDED.site_name, fetched_at = EXCLUDED.fetched_at
  `, [preview.url, preview.title || '', preview.description || '', preview.favicon || null,
       preview.siteName || '', preview.fetchedAt || Date.now()]);
}

export async function pgGetUrlPreview(url) {
  const res = await pool.query('SELECT * FROM url_previews WHERE url = $1', [url]);
  if (res.rows.length === 0) return null;
  return rowToUrlPreview(res.rows[0]);
}

export async function pgSaveReport(report) {
  await pool.query(`
    INSERT INTO reports (id, reporter_id, target_type, target_id, reason, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [report.id, report.reporterId, report.targetType, report.targetId, report.reason || '', report.createdAt || Date.now()]);
}

export async function pgGetTips() {
  const res = await pool.query('SELECT * FROM tips ORDER BY created_at DESC');
  return res.rows.map(r => ({
    id: r.id,
    fromUserId: r.from_user_id,
    postId: r.post_id,
    toUserId: r.to_user_id,
    amount: r.amount || 0,
    createdAt: Math.floor(Number(r.created_at) || Date.now())
  }));
}

export async function pgAddTip(tip) {
  await pool.query(`
    INSERT INTO tips (id, from_user_id, post_id, to_user_id, amount, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [tip.id, tip.fromUserId, tip.postId, tip.toUserId, tip.amount || 0, tip.createdAt || Date.now()]);
}

export { pool };
