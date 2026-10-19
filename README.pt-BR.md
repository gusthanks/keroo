<div align="center">

<img src="public/icons/icon-512.png" width="120" alt="Keroo, um sapo verde abraçado a uma moeda de ouro">

# Keroo

**Finanças pessoais privadas e local-first, com um sapinho da sorte te fazendo companhia.**

[![CI](https://github.com/gusthanks/keroo/actions/workflows/ci.yml/badge.svg)](https://github.com/gusthanks/keroo/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![PWA](https://img.shields.io/badge/PWA-instal%C3%A1vel-5a0fc8)
![Local-first](https://img.shields.io/badge/dados-local--first-2ea44f)

🇺🇸 [English](README.md) · 🇧🇷 Português (Brasil)

</div>

## Por que o Keroo

O Keroo é um app de finanças pessoais que roda inteiro no seu navegador. Não tem servidor, não tem conta, não tem cadastro: seus números ficam guardados no seu próprio aparelho e não saem de lá.

Ele foi pensado para o jeito como a gente lida com dinheiro no Brasil: compra parcelada no cartão, Pix para dividir a conta com os amigos e aquela fila de contas e boletos para não esquecer. Mesmo assim, serve para qualquer pessoa: o app fala português e inglês e trabalha com real, dólar ou euro.

O Keroo, o sapo, fica de olho nas suas contas e nos seus gastos e reage a eles. O humor dele vem de regras simples e determinísticas que rodam no seu aparelho, não de um modelo de IA.

**Idioma:** o Keroo abre em português quando o navegador está em português e em inglês em qualquer outro caso. Dá para trocar no primeiro passo do onboarding ou, a qualquer momento, em **Configurações → Idioma da Interface**; a escolha fica salva.

## Funcionalidades

**Orçamento**
- Contas corrente, poupança, dinheiro, investimentos e cartão de crédito, cada uma com seu extrato, além de patrimônio líquido e dinheiro disponível no Painel.
- Botão de lançamento rápido e paleta de comandos com <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>.
- Motor de orçamento por envelopes: saldo "a orçar", saldo disponível por categoria e virada de mês que leva o estouro para o mês seguinte ou zera o envelope. Veja em [Status e limitações](#status-e-limitações) o quanto disso as telas já mostram.

**Cartões e parcelas**
- Compras de 1x a 24x, lançadas na fatura certa a partir do dia de fechamento e do dia de vencimento do cartão.
- Os centavos que sobram da divisão vão sempre para a primeira parcela, então a soma das parcelas bate exatamente com o valor da compra. Exemplo: R$ 100,01 em 3x vira **R$ 33,35 + R$ 33,33 + R$ 33,33**.
- Juros mensais opcionais (Tabela Price) e uma linha do tempo de 6 a 24 meses mostrando o peso das parcelas em cada fatura futura.

**Radar de boletos e contas**
- Assinaturas e contas recorrentes, de semanais a anuais, mantendo o dia de vencimento original mesmo em meses mais curtos.
- Cada conta passa por cinco estados (pago, em dia, vence em breve, vence hoje, atrasado), e o radar avisa de tudo que vence nos próximos 3 dias.
- O custo anual de todas as suas assinaturas.
- O Keroo pergunta se você já pagou: **Já paguei!** registra a despesa e atualiza a conta e o envelope da categoria de uma vez, **Lembrar amanhã** adia o aviso e **Ajustar valor** corrige o valor de uma conta variável.

**Metas**
- Cofrinhos: metas com valor-alvo e data opcional, depósitos e retiradas, e quanto guardar por mês para chegar lá no prazo.

**Divisão e amigos**
- Cadastre amigos ou quem divide a casa com você (com chave Pix ou telefone, se quiser) e divida despesas meio a meio. Quando sobra um centavo, quem pagou fica com ele.
- Tudo com uma pessoa vira um saldo único ("você deve" ou "a receber"), que você quita com um clique.

**Importação e regras**
- Importe extratos CSV ou OFX colando o texto do arquivo. A leitura acontece no navegador e detecta sozinha o separador, o formato de data e o formato dos números (`1.234,56` ou `1,234.56`).
- Antes de salvar você vê uma prévia. Lançamentos que já existem na conta são reconhecidos por hash e ignorados, linhas inválidas são contadas, e o resto entra numa única transação que também atualiza o saldo da conta.
- Um motor de regras de categorização automática sugere a categoria enquanto você digita o favorecido de um lançamento manual.

**Keroo, o sapo**
- Cinco humores (próspero, tranquilo, atento, preocupado, dormindo) e dez poses desenhadas em SVG, escolhidas a partir das suas contas, do orçamento e dos gastos.
- Cinco dicas calculadas localmente: delivery pesando mais que o mercado, uma categoria que disparou, um mês em que parcelas terminam, o total anual das assinaturas e o dinheiro que os amigos te devem.
- Um mascote que passeia pela tela, opcional. Você dá um nome a ele no onboarding e pode desligar o passeio em Configurações.

**Privacidade e dados**
- Onboarding de 60 segundos em 4 passos: idioma, moeda, nome do sapo e ponto de partida (começar do zero ou com dados de demonstração em 1 clique).
- **Configurações → Backup e Restauração** exporta todas as tabelas para um arquivo JSON e restaura tudo de forma atômica (detalhes em [Seus dados](#seus-dados)).
- **Configurações → Senha do app** pede uma senha quando o Keroo abre e depois de 10 minutos sem uso. Só um hash da senha, com sal, fica guardado.
- **Um atalho na área de trabalho no Windows** abre o Keroo na própria janela com dois cliques (veja [Atalho na área de trabalho](#atalho-na-área-de-trabalho-windows)).
- Reset completo (clean slate), tema claro, escuro ou do sistema, e um PWA instalável que funciona offline.

## Começando

Você precisa do Node.js 22.22.2 ou mais novo na linha 22, ou do 24.15 ou mais novo. O `.nvmrc` fixa o Node 22, e o `.npmrc` liga `engine-strict=true`, então versões antigas param já na instalação.

```bash
git clone https://github.com/gusthanks/keroo.git
cd keroo
npm ci
npm run dev          # http://localhost:5173
```

Outros scripts:

```bash
npm test             # Vitest, execução única
npm run typecheck    # tsc --noEmit
npm run build        # checagem de tipos e bundle de produção em dist/
npm run preview      # serve o dist/ em http://localhost:4173
npm run test:coverage
```

## Instalar como app

O service worker só é registrado no build de produção, então o modo offline e a instalação não funcionam com `npm run dev`. Para testar localmente:

```bash
npm run build && npm run preview
```

Depois abra http://localhost:4173 e:

- **Chrome ou Edge (computador):** clique no ícone de instalar no canto direito da barra de endereço.
- **Chrome (Android):** abra o menu e escolha *Instalar app* (ou *Adicionar à tela inicial*).
- **Safari (iPhone e iPad):** toque em *Compartilhar* → *Adicionar à Tela de Início*. No iOS isso faz diferença por dois motivos: o app abre em tela cheia, sem a barra do Safari, e o Safari pode apagar os dados de sites que você não usa há 7 dias. Apps na Tela de Início têm a própria contagem de uso, então na prática os dados deles não são apagados desse jeito.

Se for hospedar o Keroo, sirva por HTTPS na raiz de um domínio (veja [Status e limitações](#status-e-limitações)).

## Atalho na área de trabalho (Windows)

Para abrir o Keroo com dois cliques, sem digitar comandos, rode isto uma vez na pasta do projeto:

```bash
npm run desktop:shortcut
```

Ele cria um ícone **Keroo** na sua área de trabalho. Quando você clica duas vezes nele, o lançador (`scripts/launch.mjs`):

1. compila o app em `dist/` na primeira vez, o que leva alguns segundos;
2. liga um servidor pequeno em segundo plano (`scripts/serve-dist.mjs`), que só este computador acessa, na porta 4173;
3. abre o Keroo numa janela própria do Microsoft Edge, sem abas e sem barra de endereço.

O servidor desliga sozinho depois de 10 minutos sem pedidos. Uma janela do Keroo aberta continua funcionando, porque o service worker guarda uma cópia do app.

O Keroo guarda os dados no Edge, no endereço `http://localhost:4173`. Abra sempre pelo ícone (ou com `npm run app`), para ele sempre achar os mesmos dados. Se algo der errado, o lançador escreve em `keroo-launcher.log`, na pasta temporária do sistema. No macOS e no Linux, `npm run app` abre o navegador padrão.

Para pegar uma versão nova depois, rode `npm run app:update`. Ele roda `git pull`, `npm ci` e `npm run build`. Na próxima vez que você abrir o Keroo, a versão nova aparece, e seus dados continuam iguais.

## Seus dados

- Tudo fica no IndexedDB do navegador, via Dexie. A escolha de idioma e de tema também fica no `localStorage`.
- Nada sai do aparelho. O Keroo não tem backend, contas nem analytics, e não faz nenhuma requisição de rede além de carregar os próprios arquivos.
- Isso também quer dizer que o navegador guarda a única cópia. Limpar os dados do site, remover o navegador ou trocar de aparelho apaga tudo.
- **Configurações → Backup e Restauração → Exportar backup** salva um arquivo `keroo-backup-AAAA-MM-DD.json` com as 14 tabelas.
- **Restaurar de arquivo** confere se o arquivo é mesmo um backup do Keroo, mostra quando ele foi feito e quantos registros tem, e pede confirmação. Aí substitui todos os dados atuais numa única transação do banco: ou tudo é restaurado, ou nada muda.
- O mesmo cartão mostra quanto espaço o Keroo está usando. No fim do onboarding, o Keroo também pede ao navegador para manter o armazenamento persistente (sem garantia; quem decide é o navegador).

- **Configurações → Senha do app** liga uma senha que o Keroo pede quando abre e depois de 10 minutos sem uso. Só um hash PBKDF2-SHA-256 da senha, com sal, fica guardado, no `localStorage` deste navegador. Por isso ele não entra nos backups. A senha impede que outras pessoas que usam o computador abram o Keroo, mas não criptografa o banco de dados. Se você esquecer a senha, a tela de bloqueio pode apagar todos os dados do Keroo, para você recomeçar e restaurar um backup.

Exporte um backup com frequência e guarde em um lugar de confiança.

## Alguns conceitos

**Orçamento por envelopes.** Todo dinheiro que entra ganha uma função: você distribui o valor em "envelopes" por categoria, os gastos vão consumindo cada um, e o que sobra (ou estoura) passa para o mês seguinte.

**Acerto de contas (netting).** Em vez de acompanhar cada despesa dividida separadamente, tudo entre você e uma pessoa vira um número só: quem deve a quem, e quanto.

**Jin Chan.** O sapo do dinheiro do folclore chinês, normalmente com três patas e uma moeda na boca, que traria prosperidade. O Keroo é uma versão original e mais fofa dele, segurando uma moeda de ouro com um furo quadrado.

## Notas de engenharia

- **Só centavos inteiros.** Todo valor é guardado e calculado como um número inteiro de centavos. Hooks do Dexie rejeitam valores não inteiros em qualquer campo monetário, e as divisões usam arredondamento explícito ou distribuição do resto.
- **Mascote determinístico.** `evaluateKerooMood` é uma função pura e síncrona, sem IA, sem rede e sem aleatoriedade. Os testes garantem menos de 2 ms por avaliação.
- **Paridade total de tradução.** `src/i18n/en-US.json` é a fonte de autoria e `src/i18n/pt-BR.json` precisa ter exatamente as mesmas chaves. Os testes falham se faltar uma chave ou se houver texto de interface fixo no código.
- **Testes.** 23 arquivos com 526 testes (Vitest, jsdom, fake-indexeddb). A CI roda a checagem de tipos, os testes e o build no Node 22 e 24.

Para ir mais fundo (documentos em inglês):

- [CLAUDE.md](CLAUDE.md): guia de engenharia, invariantes e mapa de pastas
- [AGENTS.md](AGENTS.md): regras de trabalho para pessoas e agentes de código
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitetura, fluxo de dados, motor do mascote, PWA e importação de extratos
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md): as 14 tabelas do IndexedDB e seus índices
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): tokens de cor OKLCH, tipografia e layout
- [docs/ROADMAP.md](docs/ROADMAP.md): as seis etapas de desenvolvimento

## Navegadores suportados

O Keroo precisa de IndexedDB e Service Worker. Na prática:

- Chrome ou Edge 111+
- Firefox 113+
- Safari 15.4+ (macOS, iOS e iPadOS)

As cores usam `oklch()` no CSS sem fallback, e os registros novos recebem o id de `crypto.randomUUID()`. São esses dois pontos que definem o mínimo acima, e o build de produção mira os mesmos navegadores (`build.target` no `vite.config.ts`).

Abra o Keroo por HTTPS, ou em `localhost` durante o desenvolvimento. Os navegadores desligam o service worker e o `crypto.randomUUID()` em páginas HTTP comuns, então abrir o servidor de desenvolvimento no celular por um endereço como `http://192.168.x.x:5173` não funciona por completo.

## Status e limitações

O Keroo está na **v0.1.0**, com as seis etapas do roadmap concluídas. Vale saber:

- **Dois idiomas:** inglês (en-US, o padrão) e português do Brasil (pt-BR).
- **Só na raiz do domínio:** o service worker, o manifest e os ícones usam caminhos absolutos `/`, então o build espera ser servido na raiz de um domínio. Subcaminhos, como um site de projeto no GitHub Pages (`usuario.github.io/keroo/`), ainda não são suportados.
- **Ainda sem demo online nem capturas de tela.** Rode localmente e carregue os dados de demonstração em 1 clique para conhecer o app.
- **Sem sincronização na nuvem, de propósito.** Cada navegador tem seus próprios dados. Para trocar de aparelho, exporte um backup e restaure no novo.
- **Envelopes e regras ainda não têm telas de edição.** Os dois motores estão implementados e testados, e o Painel lê os dados dos envelopes (criados pelos dados de demonstração e pelas contas pagas pelo Keroo), mas ainda não há tela para distribuir dinheiro nos envelopes nem para criar ou editar regras de categorização. As regras só funcionam se já existirem, por exemplo vindas de um backup restaurado.
- **A divisão na tela é meio a meio.** O motor também faz divisão igual entre várias pessoas, por porcentagem e por valor exato, mas a tela de Divisão & Amigos por enquanto só oferece 50/50 entre você e um contato.
- **A importação de extrato é por texto colado.** Ainda não há seletor de arquivo: abra o CSV ou OFX e cole o conteúdo.

## Como contribuir

Contribuições são bem-vindas. Leia antes o [CONTRIBUTING.md](CONTRIBUTING.md) e o [Código de Conduta](CODE_OF_CONDUCT.md). Para relatar uma vulnerabilidade, siga o [SECURITY.md](SECURITY.md) em vez de abrir uma issue pública.

Antes de abrir um pull request, rode `npm run typecheck`, `npm test` e `npm run build`. A CI roda as mesmas checagens.

## Inspirações

O Keroo não compartilha código com estes projetos; eles inspiraram o visual e as ideias:

- [Sure](https://github.com/we-promise/sure), o fork comunitário do Maybe Finance: o visual calmo e minimalista
- [Actual Budget](https://actualbudget.org/): dados local-first e orçamento por envelopes
- [Wallos](https://github.com/ellite/Wallos): o radar de assinaturas
- [Firefly III](https://www.firefly-iii.org/) e Oinc: cofrinhos e regras de categorização automática

## Licença

[MIT](LICENSE) © 2026 gusthanks
