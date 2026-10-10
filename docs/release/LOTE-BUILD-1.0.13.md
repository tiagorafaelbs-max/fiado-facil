# Lote do build novo — Android 55 e iOS 1.0.13 (autorizado pelo Tiago em 10/10/2026)

Branch: `build-1.0.13` (saída da `android-combinada`, com tudo que já está no ar por OTA + o atalho "Personalizar mensagem" `dbb9ed3`). Builds **em sequência, nunca em paralelo**: Android primeiro, depois iOS.

## Por que um build novo
Instalação nova abre a 1ª vez com o JS **embutido no binário** (builds 54/88: JS de 1.0.12, sem o funil e com o bug do teclado no cadastro) e só aplica a OTA no 2º abrir (o `app.json` não definia `fallbackToCacheTimeout`). Isso deixa o 1º abrir (onde está a perda de ~37 aparelhos × 10 contas no Android) com a versão antiga e torna o funil anônimo cego e enviesado.

## O que entra
**Configuração / nativo (muda o binário e o fingerprint)**
1. `version` 1.0.13 (iOS precisa de versão nova; Android herda o `versionName`). `ios.buildNumber` fica 88 no arquivo e o EAS sobe para 89; `android.versionCode` 54 → 55 (autoIncrement).
2. `updates.fallbackToCacheTimeout: 3000` e `checkAutomatically: "ON_LOAD"` (explícito): o 1º abrir espera a OTA até 3 s. Se o download passar disso, ele continua em segundo plano e vale no abrir seguinte.
3. `android.softwareKeyboardLayoutMode: "resize"` (explícito). **Já era o padrão do Expo** (`resize`); a causa real do bug do teclado é o modo tela inteira do Android moderno ignorar o resize, então o `TelaComTeclado` continua sendo a correção de verdade, e isto é só para deixar a intenção escrita.
4. Revisão do timeout de download das OTAs: o `expo-updates` só tem **um** controle (`fallbackToCacheTimeout`, acima). Não existe configuração de timeout do download em si (depende do sistema). Em Wi-Fi fraco o app abre com o que tem e baixa a OTA em segundo plano; o patch que falhou ("Failed to apply patch for asset") cai no download completo. 3000 ms é um meio-termo: sobe o tempo de abertura em rede ruim no máximo 3 s.

**JS (já testado e no ar por OTA; entra embutido)**
Billing do Google, "Compra recebida" e reconciliação, pedido de avaliação e botão "⭐ Avaliar", pagamento direcionado e correção do erro no valor, boas-vindas para aparelho novo, cadastro sem "Confirmar senha", teclado nas 4 telas (`TelaComTeclado`), funil anônimo, texto novo da política no app, atalho "Personalizar mensagem" (Pro abre; grátis vê o selo).

**Não entra (de propósito)**
- `expo-camera` / leitor de código de barras (fica para o Caixa).
- Itens do backlog 1.0.13 do `PROXIMO-BUILD.md` (botão "+" offline, relatórios com mais de 1.000 lançamentos, limpar caches no logout, lixeira, resumo diário da equipe...): **nenhum é nativo**, todos mudam comportamento do app e ainda não passaram por desenho + Fiscal. Entram por OTA depois, um a um. Incluí só configuração: o objetivo deste build é entregar o 1º abrir correto sem acrescentar risco.

## Runtimes (fingerprint)
Previstos com a configuração acima, **antes** do autoIncrement: Android `ba42ef4f…`, iOS `c95db959…`. Os runtimes reais são os dos binários (`eas build:view`) e vão para o relatório. Depois do build novo valem as receitas de OTA do `PROXIMO-BUILD.md`: cada binário tem o seu runtime; quem ficar nos builds 54/88 segue no runtime antigo (`61a2955d…` Android / `3ae31820…` iOS) e continua precisando de OTA nos dois lados enquanto houver uso.

## Antes do build (checklist)
`tsc` limpo ✅ · testes: teclado 14, funil 12, primeiroAcesso 6, avaliação 13, Billing 34, alocação e fila direcionada ✅ · Fiscal ✅ (a registrar).

## Depois do build
Runtime de cada binário · `eas submit` iOS (TestFlight) e Android (faixa de teste interno do Play) · aviso ao Tiago · **ele testa no A51 instalando do zero** (aparelho novo) antes de promover para produção.

## App Store Connect (feito pelo Tiago na hora do envio do 1.0.13)
- URL de política de privacidade: `https://fiadoapp.app.br/privacidade`.
- Idioma principal: pt-BR.
- App Privacy: acrescentar "ID do dispositivo" e "Interação com o produto" (não vinculados, sem rastreamento, análise) — texto em `docs/release/TEXTOS-privacidade-funil.md` §2. O `eas submit` só envia o binário; não altera esses campos.
