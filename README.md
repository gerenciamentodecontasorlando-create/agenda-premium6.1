# BTX Agenda Premium 6.1 (PWA)

**Offline-first** (IndexedDB) • **Backup/Restore JSON** • **Agenda dia/semana** • **Documentos em PDF** (Receita, Orçamento, Atestado, Laudo, Recibo)

## Como usar (GitHub Pages)
1. Suba a pasta do projeto no seu repositório.
2. Ative o GitHub Pages (Settings → Pages → Deploy from branch → main / root).
3. Abra o link no celular e toque em **“Baixar app (PWA)”**.

## Offline
- Abra **pelo menos 1 vez online** para o Service Worker cachear os arquivos + jsPDF.
- Depois disso, funciona offline (agenda, profissionais, documentos e PDF).

## Backup
- Botão **Backup** exporta tudo em JSON.
- **Restaurar** importa o JSON (recomendado recarregar após restaurar).

## Senha
- Padrão: **btx007**
- Pode mudar em **Configurações**.

## Observação
- Esta versão foi criada para ser **estável e vendável**: tudo modular, sem gambiarras.
