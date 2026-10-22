import { describe, expect, it } from 'vitest';
import { lerAmbiente, lerTela } from '../src/pje/ambiente';
import { decodificarJwt, lerCookie, lerSessao } from '../src/pje/sessao';

describe('lerAmbiente', () => {
  it('reconhece os três ambientes de qualquer TRT', () => {
    expect(lerAmbiente('https://pje.trt9.jus.br/pjekz/processo/1/detalhe')).toEqual({
      ambiente: 'pje',
      tribunal: 'trt9',
      numeroTrt: 9,
      origem: 'https://pje.trt9.jus.br',
    });
    expect(lerAmbiente('https://pje-homologacao.trt24.jus.br/pjekz/')?.ambiente).toBe('pje-homologacao');
    expect(lerAmbiente('https://pje-treinamento.trt1.jus.br/aud/#/pauta')?.tribunal).toBe('trt1');
  });

  it('recusa o que não é PJe de TRT', () => {
    expect(lerAmbiente('https://pje.trt25.jus.br/pjekz/')).toBeNull();
    expect(lerAmbiente('https://pje.tst.jus.br/pjekz/')).toBeNull();
    expect(lerAmbiente('http://pje.trt9.jus.br/pjekz/')).toBeNull();
    expect(lerAmbiente('https://exemplo.com/pje.trt9.jus.br')).toBeNull();
    expect(lerAmbiente('não é url')).toBeNull();
  });
});

describe('lerTela', () => {
  it('identifica as duas telas do Controle Individual', () => {
    expect(lerTela('/pjekz/processo/2092163/detalhe')).toEqual({ tipo: 'processo', idProcesso: 2092163, aba: 'detalhe' });
    expect(lerTela('/pjekz/processo/2092163/audiencias-sessoes')).toMatchObject({ aba: 'audiencias-sessoes' });
  });

  it('ignora as outras telas', () => {
    expect(lerTela('/pjekz/processo/2092163/retificar')).toEqual({ tipo: 'outra' });
    expect(lerTela('/pjekz/pauta-audiencias')).toEqual({ tipo: 'outra' });
    expect(lerTela('/pjekz/processo/1891131/comunicacoesprocessuais/minutas')).toEqual({ tipo: 'outra' });
  });
});

function jwt(payload: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `eyJhbGciOiJFUzI1NiJ9.${b64}.assinatura`;
}

describe('cookies e JWT', () => {
  it('lê cookie sem diferenciar maiúsculas e sem confundir prefixos', () => {
    const c = 'access_token_footer=x; Xsrf-Token=ABC123; access_token=tok';
    expect(lerCookie(c, 'xsrf-token')).toBe('ABC123');
    expect(lerCookie(c, 'access_token')).toBe('tok');
    expect(lerCookie(c, 'inexistente')).toBeUndefined();
  });

  it('decodifica payload com acentos (UTF-8)', () => {
    const p = decodificarJwt(jwt({ localizacao: { descricao: 'Direção da Secretaria' } }));
    expect(p).toEqual({ localizacao: { descricao: 'Direção da Secretaria' } });
    expect(decodificarJwt('lixo')).toBeNull();
  });

  it('extrai o órgão logado e a expiração', () => {
    const token = jwt({ exp: 1789993340, orgaoJulgador: { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' } });
    const s = lerSessao(`Xsrf-Token=XYZ; access_token=${token}`);
    expect(s.xsrfToken).toBe('XYZ');
    expect(s.accessTokenLegivel).toBe(true);
    expect(s.orgaoLogado).toEqual({ id: 174, descricao: 'CEJUSC - JT - CASCAVEL' });
    expect(s.expiraEm?.getTime()).toBe(1789993340 * 1000);
  });

  it('sem access_token, avisa que ele não é legível', () => {
    expect(lerSessao('Xsrf-Token=XYZ')).toEqual({ xsrfToken: 'XYZ', accessTokenLegivel: false });
  });
});
