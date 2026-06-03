export function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return { data: {}, body: markdown, errors: ["Missing YAML frontmatter block."] };
  }
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    return { data: {}, body: markdown, errors: ["Unclosed YAML frontmatter block."] };
  }
  const raw = markdown.slice(4, end).trim();
  const body = markdown.slice(end + 4).replace(/^\n/, "");
  const data = {};
  const errors = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      errors.push(`Could not parse frontmatter line: ${line}`);
      continue;
    }
    data[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return { data, body, errors };
}
