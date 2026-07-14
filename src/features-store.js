import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
function readJSON(file, def) {
  try { const fp = path.join(dataDir, file); if (!fs.existsSync(fp)) return def; return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return def; }
}
function writeJSON(file, data) { try { fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data, null, 2), 'utf8'); } catch(e) { console.error('Write error:', e); } }

export function getBooks() { return readJSON('books.json', []); }
export function saveBook(book) { const books = getBooks(); const i = books.findIndex(b => b.id === book.id); if (i >= 0) books[i] = { ...books[i], ...book }; else books.push(book); writeJSON('books.json', books); return book; }
export function deleteBook(id) { writeJSON('books.json', getBooks().filter(b => b.id !== id)); }

export function getSecretPosts() { return readJSON('secret_posts.json', []); }
export function saveSecretPost(post) { const posts = getSecretPosts(); const i = posts.findIndex(p => p.id === post.id); if (i >= 0) posts[i] = { ...posts[i], ...post }; else posts.push(post); writeJSON('secret_posts.json', posts); return post; }
export function deleteSecretPost(id) { writeJSON('secret_posts.json', getSecretPosts().filter(p => p.id !== id)); }

export function getSecretVisits() { return readJSON('secret_visits.json', []); }
export function addSecretVisit(v) { const list = getSecretVisits(); list.push(v); writeJSON('secret_visits.json', list); }

export function getMiniApps() { const a = readJSON('mini_apps.json', null); if (a) return a; return seedMiniApps(); }
export function saveMiniApp(app) { const apps = getMiniApps(); const i = apps.findIndex(a => a.id === app.id); if (i >= 0) apps[i] = { ...apps[i], ...app }; else apps.push(app); writeJSON('mini_apps.json', apps); return app; }

export function getGames() { const g = readJSON('games.json', null); if (g) return g; return seedGames(); }
export function saveGame(game) { const games = getGames(); const i = games.findIndex(g => g.id === game.id); if (i >= 0) games[i] = { ...games[i], ...game }; else games.push(game); writeJSON('games.json', games); return game; }

function seedMiniApps() {
  const apps = [
    { id: 'app_calc', name: '计算器', description: '简单好用的计算器', icon: '🧮', url: 'https://www.calculator.net/', developerId: 'official', developerName: '文书官方', category: 'utility', createdAt: Date.now() - 864000000 },
    { id: 'app_notes', name: '便签本', description: '随手记笔记', icon: '📝', url: 'https://justnotepad.com/', developerId: 'official', developerName: '文书官方', category: 'productivity', createdAt: Date.now() - 691200000 },
    { id: 'app_clock', name: '世界时钟', description: '查看世界各地时间', icon: '⏰', url: 'https://www.timeanddate.com/worldclock/', developerId: 'official', developerName: '文书官方', category: 'utility', createdAt: Date.now() - 518400000 },
    { id: 'app_dict', name: '汉语词典', description: '查询汉字词语', icon: '📖', url: 'https://www.zdic.net/', developerId: 'official', developerName: '文书官方', category: 'education', createdAt: Date.now() - 345600000 }
  ];
  writeJSON('mini_apps.json', apps); return apps;
}
function seedGames() {
  const games = [
    { id: 'game_2048', name: '2048', description: '经典数字合成游戏', icon: '🎮', url: 'https://play2048.co/', developerId: 'official', developerName: '文书官方', category: 'puzzle', plays: 1200, createdAt: Date.now() - 864000000 },
    { id: 'game_snake', name: '贪吃蛇', description: '经典贪吃蛇小游戏', icon: '🐍', url: 'https://snake.googlemaps.com/', developerId: 'official', developerName: '文书官方', category: 'casual', plays: 850, createdAt: Date.now() - 691200000 },
    { id: 'game_tetris', name: '俄罗斯方块', description: '经典方块消除', icon: '🧱', url: 'https://tetris.com/play-tetris', developerId: 'official', developerName: '文书官方', category: 'puzzle', plays: 960, createdAt: Date.now() - 518400000 },
    { id: 'game_minesweeper', name: '扫雷', description: '经典扫雷游戏', icon: '💣', url: 'https://minesweeper.online/', developerId: 'official', developerName: '文书官方', category: 'puzzle', plays: 720, createdAt: Date.now() - 345600000 }
  ];
  writeJSON('games.json', games); return games;
}
