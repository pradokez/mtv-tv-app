/**
 * Reads the site's channel configuration script without running it.
 *
 * The script assigns a big object to `window.CHANNEL_CONFIG`. Only two of its
 * members are data the builder needs, and both are plain literals: `info`
 * (name and icon per channel) and `sections` (channel groups, in display
 * order). Each is located by its key and read with a small literal parser
 * (strings, objects, arrays), so no downloaded code ever executes.
 */

export interface ChannelInfo {
  name: string;
  icon: string;
}

export interface ChannelSection {
  id: string;
  channels: string[];
}

export interface ChannelConfig {
  info: Record<string, ChannelInfo>;
  /** Channel groups in the site's display order. */
  sections: ChannelSection[];
}

export class ChannelConfigError extends Error {
  override name = "ChannelConfigError";
}

export function parseChannelConfig(js: string): ChannelConfig {
  const rawInfo = readMember(js, "info");
  const info: Record<string, ChannelInfo> = {};
  for (const [id, entry] of Object.entries(asObject(rawInfo, "info"))) {
    const fields = asObject(entry, `info.${id}`);
    info[id] = { name: asString(fields.name, `info.${id}.name`), icon: asString(fields.icon, `info.${id}.icon`) };
  }
  if (Object.keys(info).length === 0) throw new ChannelConfigError("nenhum canal em `info` na configuração de canais");
  const sections = Object.entries(asObject(readMember(js, "sections"), "sections")).map(([id, raw]) => {
    const channels = asObject(raw, `sections.${id}`).channels;
    if (!Array.isArray(channels)) throw new ChannelConfigError(`\`sections.${id}.channels\` deveria ser uma lista`);
    return { id, channels: channels.map((c, i) => asString(c, `sections.${id}.channels[${i}]`)) };
  });
  return { info, sections };
}

type Literal = string | Literal[] | { [key: string]: Literal };

/** Finds `<key>: <literal>` and parses the literal. */
function readMember(js: string, key: string): Literal {
  const match = new RegExp(`(?:^|[\\s{,])${key}\\s*:\\s*(?=[{\\[])`, "m").exec(js);
  if (!match) throw new ChannelConfigError(`não achei \`${key}\` na configuração de canais`);
  return new LiteralParser(js, match.index + match[0].length).value();
}

function asObject(value: Literal, where: string): { [key: string]: Literal } {
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ChannelConfigError(`\`${where}\` deveria ser um objeto`);
  }
  return value;
}

function asString(value: Literal | undefined, where: string): string {
  if (typeof value !== "string") throw new ChannelConfigError(`\`${where}\` deveria ser um texto`);
  return value;
}

class LiteralParser {
  private readonly src: string;
  private pos: number;

  constructor(src: string, pos: number) {
    this.src = src;
    this.pos = pos;
  }

  value(): Literal {
    this.skip();
    const c = this.src[this.pos];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === "'" || c === '"' || c === "`") return this.string();
    throw this.error("valor inesperado");
  }

  private object(): { [key: string]: Literal } {
    const result: { [key: string]: Literal } = {};
    this.pos++; // {
    for (;;) {
      this.skip();
      if (this.src[this.pos] === "}") {
        this.pos++;
        return result;
      }
      const key = this.key();
      this.skip();
      if (this.src[this.pos] !== ":") throw this.error("esperava `:`");
      this.pos++;
      result[key] = this.value();
      this.separator("}");
    }
  }

  private array(): Literal[] {
    const result: Literal[] = [];
    this.pos++; // [
    for (;;) {
      this.skip();
      if (this.src[this.pos] === "]") {
        this.pos++;
        return result;
      }
      result.push(this.value());
      this.separator("]");
    }
  }

  private key(): string {
    const c = this.src[this.pos];
    if (c === "'" || c === '"') return this.string();
    const match = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.pos, this.pos + 200));
    if (!match) throw this.error("chave inválida");
    this.pos += match[0].length;
    return match[0];
  }

  private string(): string {
    const quote = this.src[this.pos++];
    let result = "";
    for (;;) {
      const c = this.src[this.pos++];
      if (c === undefined) throw this.error("texto sem fim");
      if (c === quote) return result;
      if (quote === "`" && c === "$" && this.src[this.pos] === "{") throw this.error("template com interpolação");
      if (c === "\\") {
        const next = this.src[this.pos++];
        result += next === "n" ? "\n" : next === "t" ? "\t" : (next ?? "");
      } else {
        result += c;
      }
    }
  }

  /** After a member or element: a comma, or the closing bracket. */
  private separator(close: "}" | "]") {
    this.skip();
    const c = this.src[this.pos];
    if (c === ",") this.pos++;
    else if (c !== close) throw this.error(`esperava \`,\` ou \`${close}\``);
  }

  /** Skips whitespace and comments. */
  private skip() {
    for (;;) {
      const rest = this.src.slice(this.pos, this.pos + 2);
      if (/^\s/.test(rest)) this.pos++;
      else if (rest === "//") this.pos = this.lineEnd();
      else if (rest === "/*") this.pos = this.after("*/");
      else return;
    }
  }

  private lineEnd(): number {
    const end = this.src.indexOf("\n", this.pos);
    return end === -1 ? this.src.length : end;
  }

  private after(token: string): number {
    const at = this.src.indexOf(token, this.pos + 2);
    if (at === -1) throw this.error("comentário sem fim");
    return at + token.length;
  }

  private error(detail: string): ChannelConfigError {
    return new ChannelConfigError(`configuração de canais ilegível na posição ${this.pos}: ${detail}`);
  }
}
