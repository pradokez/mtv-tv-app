# Casca Tizen (Samsung Q80)

Empacota o app web como `.wgt` e instala na Samsung QN55Q80TAGXZD (Tizen 5.5) por `sdb`, em modo desenvolvedor, para uso pessoal. O app web é único (`web/`); esta pasta só tem o manifesto, o ícone e os scripts. Ver o PRD na issue #40.

| Arquivo | Para quê |
| --- | --- |
| `config.xml` | Manifesto: id `mtvtv00001.MtvTv`, tela cheia, privilégios `internet`, `network.get`, `power` e `tv.inputdevice` |
| `icon.png` | Ícone |
| `test-page/` | Página mínima que mostra `navigator.userAgent` (primeiro marco) |
| `scripts/build-wgt.sh` | Gera o `.wgt` assinado em `tizen/build/`; falha se o pacote sair sem assinatura |
| `scripts/install-tv.sh` | Instala o `.wgt` na TV e abre o app |

## Uso

```bash
tizen/scripts/build-wgt.sh --test   # página de teste (padrão)
tizen/scripts/build-wgt.sh --app    # rebuilda web/ (pnpm build:tizen) e empacota web/dist-tizen
tizen/scripts/install-tv.sh         # IP padrão 192.168.0.13; ou install-tv.sh <ip> / TV_IP=<ip>
```

`--app` sempre roda `pnpm build:tizen` antes de empacotar, para nunca instalar um `dist-tizen/` velho. Esse build (`vite build --mode tizen`) converte JS e CSS para `chrome69`, o Chromium da Q80 (ver [Chromium da Q80](#chromium-da-q80)), e grava em `web/dist-tizen/`; o `pnpm build` normal (web e Android) continua igual em `web/dist/`.

Depois do build, `web/scripts/check-bundle.ts` confere o `dist-tizen/` e falha o build (e o `--app`) se sobrar sintaxe acima do Chromium 69: `?.`, `??`, BigInt ou qualquer coisa além do ES2020 no JS, e `inset`, `aspect-ratio`, `:is()`, `:where()`, `:has()` ou `@layer` no CSS. Para conferir outro build à mão: `cd web && node scripts/check-bundle.ts dist`. O que a conversão não resolve (gap em flex, `backdrop-filter`) está em [`web/docs/chromium69-apis.md`](../web/docs/chromium69-apis.md).

> A TV é compartilhada e tem dados reais de uso. Confirme com o dono antes de instalar ou apagar qualquer coisa nela.

## Passo a passo

### 1. Modo desenvolvedor na TV
1. Em **Apps**, digite `12345` (o controle não tem teclado numérico: o botão 123 só abre o teclado na tela de Apps; o SmartThings no celular também serve).
2. Ligue **Developer mode** e preencha **Host PC IP** com o IP do Mac (`ipconfig getifaddr en0`).
3. Desligue e ligue a TV de verdade (pelo controle, depois tire da tomada se preciso). Sem reiniciar, a porta do `sdb` não abre.
4. Confira: `nc -z 192.168.0.13 26101`. Porta fechada = modo desenvolvedor não está valendo. O IP do Mac pode mudar e a TV precisa estar na mesma rede.

### 2. Tizen Studio, PATH e JAVA_HOME
- Tizen Studio 6.1 em `~/tizen-studio`, com a extensão **TV-SAMSUNG-Public** e o pacote **cert-add-on** (Samsung Certificate Extension; sem ele o Certificate Manager não oferece Samsung).
- O `sdb` e o `tizen` não estão no PATH. Os scripts carregam `scripts/env.sh`, que adiciona `~/tizen-studio/tools` e `~/tizen-studio/tools/ide/bin` e define `JAVA_HOME` (`/opt/homebrew/opt/openjdk@17`, de `brew install openjdk@17`) se estiver vazio. Para usar à mão: `. tizen/scripts/env.sh`.

### 3. Conectar
```bash
sdb connect 192.168.0.13   # porta 26101
sdb devices                # deve listar a Q80
```

### 4. DUID e certificado
- DUID da Q80: `XTCPHIWAYLR4S` (`sdb shell '0 getduid'` ou `sdb capability`, com a TV conectada).
- Perfil de certificado `mtvtv` (`tizen security-profiles list`), que junta o certificado de autor (`~/tizen-studio-data/keystore/author/author.p12`, senha no `.pw` da mesma pasta) e o de distribuidor Samsung com o DUID (`~/SamsungCertificate/mtvtv/distributor.p12`).
- Cada `.wgt` é assinado com esse perfil por `tizen package -t wgt -s mtvtv`.

### 5. Renovar o certificado
O certificado de distribuidor expira. Quando a instalação falhar com erro de certificado:
1. Abra o **Certificate Manager** (`~/tizen-studio/tools/certificate-manager`), entre com a conta Samsung e crie um novo certificado de distribuidor, marcando o DUID acima.
2. Aponte o perfil `mtvtv` para o novo certificado (Certificate Manager, aba de perfis) ou crie outro e passe `CERT_PROFILE=<nome>` aos scripts.
3. Rebuilde (`build-wgt.sh`) e reinstale (`install-tv.sh`). Se der conflito com a versão instalada, rode `tizen uninstall -p mtvtv00001.MtvTv -s 192.168.0.13:26101` e instale de novo.

## Problemas conhecidos

- `Failed to install Tizen application.` sem mais detalhes: o `pkgcmd` da TV falha com espaço no nome do arquivo (`MTV TV.wgt`). O `build-wgt.sh` renomeia o pacote para `mtv-tv.wgt`. O id do pacote também precisa ter exatamente 10 caracteres alfanuméricos (`mtvtv00001`).
- Os comandos do Tizen usam `-s <ip>:26101` (serial); `-t` espera o nome do dispositivo (`QN55Q80TAGXZD`).
- `sdb shell` é bloqueado nesta TV, então o log do aparelho não está acessível; o `userAgent` é lido na tela.

## Chromium da Q80

Medido na TV real em 2026-11-08 com a página de teste: **Chromium 69.0.3497.106** (Tizen 5.5, armv7). O `userAgent` não tem `Chrome/`:

```
Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36
```

Isso confirma o alvo `chrome69` previsto no PRD #40 para o build do app.

## Primeiro boot na Q80 (issue #50)

Medido na TV real em 2026-11-08, com o app completo. Para ler o console sem `sdb shell`, usei um pacote temporário (não commitado) com um script que mandava `onerror`/`console.error` por `new Image().src = "http://<ip-do-mac>:8099/log?..."` a um servidor no Mac; o CSP do app precisa de `img-src` para esse host, e o `config.xml` de `<access>` (abaixo).

| Achado | Efeito na TV | Decisão |
| --- | --- | --- |
| `<script type="module" crossorigin>` em `file://` | Tela branca: o Chromium 69 recusa o módulo (CORS) e o app nunca roda | `vite build --mode tizen` gera IIFE e o HTML sai com `<script defer>` (sem `crossorigin`); o CSS vai num só arquivo |
| Sem `<access origin>` no `config.xml` | Qualquer requisição fora do pacote (inclusive o YouTube) é bloqueada | `<access origin="*" subdomains="true"/>` |
| `fetch`/XHR de `catalog.json` | Funciona em `file://` depois do `<access>`; o catálogo real (12 MB, ~106 mil vídeos) carrega | nenhuma |
| iframe do YouTube em `file://` | **Erro 153** (configuração do player) em todo vídeo: o iframe depende do `Referer` da página e `file://` não tem; `origin` e `widget_referrer` https passados nos `playerVars` não resolvem | **Em aberto**: precisa de uma origem http(s) (ver a issue de acompanhamento) |

Com o app servido por http (testado a partir do Mac), o 153 some, o que confirma a causa.
