# Casca Tizen (Samsung Q80)

Empacota o app web como `.wgt` e instala na Samsung QN55Q80TAGXZD (Tizen 5.5) por `sdb`, em modo desenvolvedor, para uso pessoal. O app web é único (`web/`); esta pasta só tem o manifesto, o ícone e os scripts. Ver o PRD na issue #40.

| Arquivo | Para quê |
| --- | --- |
| `config.xml` | Manifesto: id `mtvtv0001.MtvTv`, tela cheia, privilégios `internet`, `network.get`, `power` e `tv.inputdevice` |
| `icon.png` | Ícone |
| `test-page/` | Página mínima que mostra `navigator.userAgent` (primeiro marco) |
| `scripts/build-wgt.sh` | Gera o `.wgt` assinado em `tizen/build/` |
| `scripts/install-tv.sh` | Instala o `.wgt` na TV e abre o app |

## Uso

```bash
tizen/scripts/build-wgt.sh --test   # página de teste (padrão)
tizen/scripts/build-wgt.sh --app    # rebuilda web/ (pnpm build) e empacota web/dist
tizen/scripts/install-tv.sh         # IP padrão 192.168.0.13; ou install-tv.sh <ip> / TV_IP=<ip>
```

`--app` sempre roda `pnpm build` antes de empacotar, para nunca instalar um `dist/` velho. O alvo de Chromium do build (a Q80 tem um Chromium antigo) é tratado em outra fatia do PRD.

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
3. Rebuilde (`build-wgt.sh`) e reinstale (`install-tv.sh`). Se der conflito com a versão instalada, rode `tizen uninstall -p mtvtv0001.MtvTv -t 192.168.0.13:26101` e instale de novo.

## Chromium da Q80

A preencher depois da primeira instalação (página de teste, linha "Chromium").
