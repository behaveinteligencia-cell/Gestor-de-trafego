/**
 * Conversor Markdown → HTML mínimo para os relatórios (títulos, parágrafos,
 * listas, tabelas, negrito/itálico/código/links). Sem dependência externa.
 */
function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return escapar(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline">$1</a>')
    .replace(/ {2}$/g, "<br/>");
}

export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      out.push(`<p>${paragrafo.map(inline).join(" ")}</p>`);
      paragrafo = [];
    }
  };
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) {
      fecharParagrafo();
      i++;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      fecharParagrafo();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (l.startsWith("|") && linhas[i + 1]?.match(/^\|\s*:?-+/)) {
      fecharParagrafo();
      const celulas = (s: string) => s.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const cab = celulas(l);
      const alinh = celulas(linhas[i + 1]).map((c) => (c.endsWith(":") && !c.startsWith(":") ? "right" : "left"));
      i += 2;
      const corpo: string[] = [];
      while (i < linhas.length && linhas[i].startsWith("|")) {
        corpo.push(`<tr>${celulas(linhas[i]).map((c, k) => `<td style="text-align:${alinh[k] ?? "left"}">${inline(c)}</td>`).join("")}</tr>`);
        i++;
      }
      out.push(`<table><thead><tr>${cab.map((c, k) => `<th style="text-align:${alinh[k] ?? "left"}">${inline(c)}</th>`).join("")}</tr></thead><tbody>${corpo.join("")}</tbody></table>`);
      continue;
    }
    const li = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      fecharParagrafo();
      const ordenada = /\d/.test(li[1]);
      const itens: string[] = [];
      while (i < linhas.length) {
        const m = linhas[i].match(/^\s*([-*]|\d+\.)\s+(.*)$/);
        if (!m) break;
        itens.push(`<li>${inline(m[2])}</li>`);
        i++;
      }
      out.push(`<${ordenada ? "ol" : "ul"}>${itens.join("")}</${ordenada ? "ol" : "ul"}>`);
      continue;
    }
    if (l.startsWith("```")) {
      fecharParagrafo();
      const bloco: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].startsWith("```")) bloco.push(linhas[i++]);
      i++;
      out.push(`<pre><code>${escapar(bloco.join("\n"))}</code></pre>`);
      continue;
    }
    paragrafo.push(l);
    i++;
  }
  fecharParagrafo();
  return out.join("\n");
}
