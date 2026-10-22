import { novoAceite, VERSAO_TERMOS } from '../config/opcoes';
import { aoMudarArmazenado, lerArmazenado, salvarAceite } from '../ext/api';

const $ = (id: string) => document.getElementById(id);

async function atualizar() {
  const { aceite } = await lerArmazenado(__AUDAID_DEV__);
  const estado = $('estado-aceite');
  const botao = $('aceitar') as HTMLButtonElement | null;
  if (!estado || !botao) return;
  if (aceite) {
    estado.className = 'estado-ok';
    estado.textContent = `Aceito em ${new Date(aceite.aceitoEm).toLocaleString('pt-BR')}. O AudAid está ativo. Pode fechar esta aba.`;
    botao.disabled = true;
    botao.textContent = 'Termos aceitos';
  } else {
    estado.className = 'suave';
    estado.textContent = 'Você ainda não aceitou estes termos. Até aceitar, o AudAid fica inativo.';
    botao.disabled = false;
    botao.textContent = 'Li e concordo';
  }
}

($('versao-termos') as HTMLElement).textContent = String(VERSAO_TERMOS);
($('versao-extensao') as HTMLElement).textContent = __AUDAID_VERSAO__;
$('aceitar')?.addEventListener('click', () => void salvarAceite(novoAceite()));
aoMudarArmazenado(() => void atualizar());
void atualizar();
