const { config } = global.BlackBot;
const activeSpams = new Map();

const SPAM_TEXT = `ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـجـ👑ـ👑ـ👑ـ🪽ـحـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـسـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑ـ🪽ـفـ👑ـ👑ـ👑ـ🪽ـيـ👑ـ👑ـ🪽ـنـ👑ـ👑ـ👑ـ🪽ـمـ👑ـ👑ـ👑ـ🪽ـكـ👑ـ👑ـ👑

‌⌯ ⟅˖ִ𝗜 𝗔𝗠 ࿂͜•𝙈𝙖𝙨𝙩𝙚𝙧 ། 𝙙𝙚̲̅𝙖̲̅𝙩̲̅𝙝ᬼ 
𝘵͟𝘩𝘦 𝘨͟r͟𝘦𝘢͟𝘵͟𝘦𝘴𝘵 𝘸𝘳𝘪͟𝘭͟͟𝘪͟͟𝘵͟𝘦𝘳 ͟o͟𝘧 𝘵𝘩𝘦 ͟𝘦͟𝘷𝘪𝘭 ͟𝘮͟𝘢͟𝘴͟𝘵𝘦𝘳'𝘴 𝘯͟e͟𝘸𝘴͟𝘱͟𝘢𝘱𝘦𝘳 

 ‌           ⏤͟͟͞͞🟡                        

     𝗥𝗲𝘁𝘶𝗿𝗻 𝗼𝗳 𝘁𝗵𝗲 𝗗𝗲𝗮𝗱      
 ‌ ‌   ─⃝͎̽𝙎𖤌˖𝘼ɵ⃪𝆭͜͡X͎𝆭̽ʌ𝆭⃟ɴ𝙄☃️𝆺𝅥⃝𝙈✬      

 ➣  🇳🇺𝆺𝅥⃝𝗗𝗘𝗩𝗜𝗟 ۬༐ 𝗦҈𝗮𝗶𝗻𝘁 🇳🇺𒁂`;

const groupCache = new Map();

module.exports = {
	config: {
		name: "ركوب",
		aliases: ["ride"],
		version: "2.0",
		author: "BlackBot",
		countDown: 5,
		role: 2,
		description: {
			ar: "إنشاء مجموعة مع الشخص وإرسال رسائل متكررة فيها"
		},
		category: "admin",
		guide: {
			ar: "{pn} <ID> <وقت>\n• 5s = كل 5 ثواني\n• 5 = كل 5 دقائق\n\n{pn} وقف <ID> — إيقاف الإرسال\n{pn} وقف — إيقاف الكل\n\nمثال: {pn} 123456789 5s\nأو رد على رسالة: {pn} 5s"
		}
	},

	langs: {
		ar: {
			noInput: "⚠️ | استخدم:\n• .ركوب <ID> <وقت>\n• رد على رسالة + .ركوب <وقت>\n\nالوقت: 5s = 5 ثواني | 5 = 5 دقائق\n\n• .ركوب وقف — إيقاف الكل\n• .ركوب وقف <ID> — إيقاف شخص",
			started: "🚀 | بدأ الإرسال لـ %1\n⏱️ كل %2\n📌 المجموعة: %3\n\nللإيقاف: .ركوب وقف %1",
			stopped: "⛔ | تم إيقاف الإرسال لـ %1",
			stoppedAll: "⛔ | تم إيقاف جميع عمليات الإرسال (%1)",
			noActive: "⚠️ | لا توجد عمليات إرسال نشطة",
			alreadyActive: "⚠️ | الإرسال نشط بالفعل لـ %1\nاستخدم .ركوب وقف %1 أولاً",
			invalidTime: "⚠️ | الوقت غير صالح. استخدم:\n• 5s = 5 ثواني\n• 5 = 5 دقائق",
			invalidID: "⚠️ | الـ ID غير صالح",
			creatingGroup: "⏳ | جاري إنشاء مجموعة مع الهدف...",
			groupFailed: "❌ | فشل إنشاء المجموعة: %1"
		}
	},

	onStart: async function ({ api, event, args, getLang }) {
		const adminIDs = config.adminBot || [];
		if (!adminIDs.includes(event.senderID)) return;

		if (args[0] === "وقف" || args[0] === "stop") {
			if (args[1] && /^\d+$/.test(args[1])) {
				const key = args[1];
				if (activeSpams.has(key)) {
					clearInterval(activeSpams.get(key));
					activeSpams.delete(key);
					return api.sendMessage(getLang("stopped", key), event.threadID, event.messageID);
				}
				return api.sendMessage(getLang("noActive"), event.threadID, event.messageID);
			}
			if (activeSpams.size === 0) {
				return api.sendMessage(getLang("noActive"), event.threadID, event.messageID);
			}
			const count = activeSpams.size;
			for (const [k, v] of activeSpams) {
				clearInterval(v);
			}
			activeSpams.clear();
			return api.sendMessage(getLang("stoppedAll", count), event.threadID, event.messageID);
		}

		let targetID, timeArg;

		if (event.messageReply) {
			targetID = event.messageReply.senderID;
			timeArg = args[0];
		} else {
			if (args.length < 2) {
				return api.sendMessage(getLang("noInput"), event.threadID, event.messageID);
			}
			targetID = args[0];
			timeArg = args[1];
		}

		if (targetID && /facebook\.com/.test(targetID)) {
			let extracted = null;
			const idMatch = targetID.match(/profile\.php\?id=(\d+)/);
			if (idMatch) {
				extracted = idMatch[1];
			} else {
				const nameMatch = targetID.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
				if (nameMatch && nameMatch[1] !== "profile.php") {
					extracted = nameMatch[1];
				}
			}
			if (!extracted) {
				return api.sendMessage(getLang("invalidID"), event.threadID, event.messageID);
			}
			if (!/^\d+$/.test(extracted)) {
				try {
					const users = await api.getUserID(extracted);
					if (users && users.length > 0) {
						extracted = users[0].userID;
					} else {
						return api.sendMessage("⚠️ | لم يتم العثور على المستخدم: " + extracted, event.threadID, event.messageID);
					}
				} catch (e) {
					return api.sendMessage("⚠️ | خطأ في البحث عن المستخدم: " + (e.message || e), event.threadID, event.messageID);
				}
			}
			targetID = extracted;
		}

		if (!targetID || !/^\d+$/.test(targetID)) {
			return api.sendMessage(getLang("invalidID"), event.threadID, event.messageID);
		}

		if (!timeArg) {
			return api.sendMessage(getLang("noInput"), event.threadID, event.messageID);
		}

		let intervalMs;
		const timeMatch = timeArg.match(/^(\d+)(s?)$/i);
		if (!timeMatch) {
			return api.sendMessage(getLang("invalidTime"), event.threadID, event.messageID);
		}

		const num = parseInt(timeMatch[1]);
		if (num <= 0) {
			return api.sendMessage(getLang("invalidTime"), event.threadID, event.messageID);
		}

		if (timeMatch[2].toLowerCase() === "s") {
			intervalMs = num * 1000;
		} else {
			intervalMs = num * 60000;
		}

		if (activeSpams.has(targetID)) {
			return api.sendMessage(getLang("alreadyActive", targetID), event.threadID, event.messageID);
		}

		const timeLabel = timeMatch[2].toLowerCase() === "s" ? `${num} ثانية` : `${num} دقيقة`;

		try {
			if (typeof api.sendFriendRequest === "function") {
				api.sendFriendRequest(targetID, (err) => {
					if (err) console.log("Friend request error:", err);
				});
			}
		} catch (_) {}

		api.sendMessage(getLang("creatingGroup"), event.threadID);

		let groupThreadID = groupCache.get(targetID);

		if (!groupThreadID) {
			try {
				groupThreadID = await new Promise((resolve, reject) => {
					api.createNewGroup([event.senderID, targetID], "🚀", (err, threadID) => {
						if (err) return reject(err);
						resolve(threadID);
					});
				});
				groupCache.set(targetID, groupThreadID);
				console.log("RIDE: Created group", groupThreadID, "for target", targetID);
			} catch (err) {
				console.log("RIDE: Group creation failed:", JSON.stringify(err));
				return api.sendMessage(getLang("groupFailed", err.error || err.errorSummary || JSON.stringify(err)), event.threadID, event.messageID);
			}
		}

		api.sendMessage(SPAM_TEXT, groupThreadID, (err, info) => {
			if (err) {
				console.log("RIDE SEND ERROR:", JSON.stringify(err));
				api.sendMessage("❌ | فشل الإرسال الأول: " + (err.error || err.errorSummary || JSON.stringify(err)), event.threadID);
			} else {
				console.log("RIDE SEND OK:", JSON.stringify(info));
			}
		});

		const interval = setInterval(() => {
			api.sendMessage(SPAM_TEXT, groupThreadID, (err, info) => {
				if (err) {
					console.log("RIDE REPEAT ERROR:", JSON.stringify(err));
					clearInterval(interval);
					activeSpams.delete(targetID);
					api.sendMessage("⛔ | توقف الإرسال لـ " + targetID + " بسبب خطأ: " + (err.error || err.errorSummary || ""), event.threadID);
				}
			});
		}, intervalMs);

		activeSpams.set(targetID, interval);

		api.sendMessage(getLang("started", targetID, timeLabel, groupThreadID), event.threadID, event.messageID);
	}
};
