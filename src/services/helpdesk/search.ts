import type { HelpArticle } from '../../domain/types';
import { ARTICLES } from './articles';

export interface ArticleMatch {
  article: HelpArticle;
  score: number;
}

const STOPWORDS = new Set(['a', 'o', 'e', 'de', 'do', 'da', 'em', 'no', 'na', 'um', 'uma', 'que', 'meu', 'minha', 'para', 'com', 'nao', 'não', 'esta', 'está', 'to', 'tá', 'eu', 'me', 'se', 'ao', 'as', 'os']);

const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ');

const tokenize = (s: string): string[] =>
  normalize(s).split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

export function searchArticles(query: string, limit = 3, articles: HelpArticle[] = ARTICLES): ArticleMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matches = articles.map((article) => {
    const title = normalize(article.title);
    const keywords = normalize(article.keywords.join(' '));
    const body = normalize(`${article.body} ${article.limitations ?? ''}`);
    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 3;
      if (keywords.includes(t)) score += 2;
      if (body.includes(t)) score += 1;
    }
    return { article, score };
  });

  return matches
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
