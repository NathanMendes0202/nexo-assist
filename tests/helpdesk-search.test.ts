import { describe, expect, it } from 'vitest';
import { searchArticles } from '../src/services/helpdesk/search';

describe('central de ajuda', () => {
  it('acha o artigo da VPN pelo erro 809', () => {
    expect(searchArticles('minha vpn dá erro 809')[0]?.article.id).toBe('kb-vpn-809');
  });

  it('ignora acentos e maiúsculas', () => {
    expect(searchArticles('HORARIO de atendimento')[0]?.article.id).toBe('kb-horario');
  });

  it('não inventa resultado para assunto fora da base', () => {
    expect(searchArticles('quando sai o décimo terceiro')).toEqual([]);
  });
});
