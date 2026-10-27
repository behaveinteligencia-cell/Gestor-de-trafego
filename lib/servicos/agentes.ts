import fs from "node:fs";
import path from "node:path";
import type { AgenteEspecializado, SkillClaude } from "../types";

// Lê os agentes (.claude/agents/<nome>.md) e skills (.claude/skills/<nome>/SKILL.md)
// do próprio repositório para a interface mostrar o que o Claude sabe fazer.

function raiz(): string {
  return process.env.GESTOR_RAIZ ?? process.cwd();
}

function frontmatter(texto: string): { meta: Record<string, string>; corpo: string } {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: texto };
  const meta: Record<string, string> = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(":");
    if (i === -1) continue;
    const chave = linha.slice(0, i).trim();
    let valor = linha.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    meta[chave] = valor;
  }
  return { meta, corpo: m[2] };
}

export function listarAgentes(): AgenteEspecializado[] {
  const dir = path.join(raiz(), ".claude", "agents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const arquivo = path.join(dir, f);
      const { meta, corpo } = frontmatter(fs.readFileSync(arquivo, "utf8"));
      const nome = meta.name ?? f.replace(/\.md$/, "");
      return {
        nome,
        titulo: nome
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" "),
        descricao: meta.description ?? "",
        ferramentas: (meta.tools ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        arquivo: path.relative(raiz(), arquivo),
        corpo: corpo.trim(),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export function listarSkills(): SkillClaude[] {
  const dir = path.join(raiz(), ".claude", "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => {
      const arquivo = path.join(dir, d.name, "SKILL.md");
      const { meta } = frontmatter(fs.readFileSync(arquivo, "utf8"));
      const nome = meta.name ?? d.name;
      return {
        nome,
        descricao: meta.description ?? "",
        comando: `/${nome}`,
        arquivo: path.relative(raiz(), arquivo),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
