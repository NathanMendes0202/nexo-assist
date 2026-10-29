import type { HelpArticle } from '../../domain/types';

export const ARTICLES: HelpArticle[] = [
  {
    id: 'kb-vpn-809',
    title: 'VPN com erro 809',
    body: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador.',
    limitations: 'Vale apenas para Windows 10. No Windows 11, abra um chamado.',
    category: 'Rede e VPN',
    keywords: ['vpn', 'erro 809', '809', 'conectar', 'conecta', 'remoto', 'cliente vpn'],
  },
  {
    id: 'kb-horario',
    title: 'Horário do service desk',
    body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
    category: 'Outros',
    keywords: ['horário', 'horario', 'atendimento', 'plantão', 'plantao', 'funciona', 'expediente'],
  },
  {
    id: 'kb-prazos',
    title: 'Prazos de atendimento por prioridade',
    body: 'Crítica: 1 hora. Alta: 4 horas úteis. Média: 3 dias úteis. Baixa: 5 dias úteis. O prazo vale para a primeira resposta e para cada atualização.',
    category: 'Outros',
    keywords: ['prazo', 'sla', 'prioridade', 'vencido', 'atrasado', 'quanto tempo'],
  },
  {
    id: 'kb-senha-rede',
    title: 'Esqueci ou bloqueei a senha da rede',
    body: 'Redefina pelo portal de autoatendimento de senha. Se a conta estiver bloqueada, aguarde 15 minutos e tente de novo, ou ligue no ramal 4000.',
    category: 'Acesso',
    keywords: ['senha', 'esqueci', 'bloqueada', 'bloqueou', 'redefinir', 'resetar', 'login', 'conta bloqueada'],
  },
  {
    id: 'kb-wifi',
    title: 'Como conectar no Wi-Fi corporativo',
    body: 'Use a rede Nexo-Corp com seu e-mail corporativo e a senha da rede. Visitantes usam a rede Nexo-Guest com a senha do dia, disponível na recepção.',
    category: 'Rede e VPN',
    keywords: ['wifi', 'wi-fi', 'rede sem fio', 'internet', 'visitante', 'nexo-corp', 'nexo-guest'],
  },
  {
    id: 'kb-outlook-celular',
    title: 'Outlook não sincroniza no celular',
    body: 'Remova a conta do app, reinstale o Outlook e adicione a conta de novo. Se continuar sem sincronizar, abra um chamado de E-mail.',
    category: 'E-mail',
    keywords: ['outlook', 'email', 'e-mail', 'celular', 'sincroniza', 'sincronizar', 'app', 'caixa de entrada'],
  },
  {
    id: 'kb-notebook-lento',
    title: 'Notebook lento',
    body: 'Reinicie o equipamento, libere pelo menos 15 GB de espaço em disco e rode o diagnóstico pelo portal de softwares.',
    limitations: 'Se a lentidão começou após uma atualização do Windows e persiste depois do diagnóstico, abra um chamado de Hardware.',
    category: 'Hardware',
    keywords: ['lento', 'lentidão', 'travando', 'travado', 'devagar', 'notebook', 'computador', 'desempenho'],
  },
  {
    id: 'kb-software',
    title: 'Como pedir a instalação de um software',
    body: 'Se o programa estiver no portal de softwares, instale por lá. Se não estiver, abra uma requisição de Software com a justificativa e a aprovação do seu gestor.',
    category: 'Software',
    keywords: ['software', 'programa', 'instalar', 'instalação', 'licença', 'aplicativo', 'portal de softwares'],
  },
  {
    id: 'kb-equipamento',
    title: 'Solicitar equipamento (monitor, mouse, teclado)',
    body: 'Abra uma requisição de Hardware informando o equipamento e o motivo. Pedidos passam pela aprovação do gestor antes da entrega.',
    category: 'Hardware',
    keywords: ['monitor', 'mouse', 'teclado', 'equipamento', 'headset', 'home office', 'pedir', 'solicitar'],
  },
];
