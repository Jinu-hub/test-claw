import type { RealityContext, WatchIntent } from "./types";

function renderBulletList(items: string[]): string {
  if (items.length === 0) return "- (none)";
  return items.map((item) => `- ${item}`).join("\n");
}

function extractListAfterHeading(section: string, heading: string): string[] {
  const pattern = new RegExp(`${heading}:\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][\\w ]*:|$)`, "i");
  const match = section.match(pattern);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0 && line !== "(none)");
}

function extractField(section: string, label: string): string {
  const pattern = new RegExp(`^${label}:\\s*(.*)$`, "im");
  const match = section.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function serializeRealityContext(context: RealityContext): string {
  const sectionsMarkdown = context.sections
    .map(
      (section) => `### ${section.title}
<!-- section: ${section.key} -->

${section.body.trim()}`
    )
    .join("\n\n");

  return `# ${context.name}

## Target Profile
<!-- system managed -->

Description: ${context.profile.description}
Category: ${context.profile.category}
Created: ${context.profile.created}
Last Updated: ${context.profile.lastUpdated}

## Watch Intent
<!-- user + agent managed -->

Focus:
${renderBulletList(context.intent.focus)}

Ignore:
${renderBulletList(context.intent.ignore)}

Priority:
${renderBulletList(context.intent.priority)}

## Current Reality
<!-- agent managed -->

${sectionsMarkdown}

## Open Questions
<!-- agent managed -->

${renderBulletList(context.openQuestions)}
`;
}

export function parseRealityContext(
  markdown: string,
  targetId: string
): RealityContext {
  const nameMatch = markdown.match(/^#\s+(.+)$/m);
  const name = nameMatch?.[1]?.trim() ?? targetId;

  const profileBlock =
    markdown.match(
      /## Target Profile[\s\S]*?(?=## Watch Intent|$)/
    )?.[0] ?? "";
  const intentBlock =
    markdown.match(
      /## Watch Intent[\s\S]*?(?=## Current Reality|$)/
    )?.[0] ?? "";
  const realityBlock =
    markdown.match(
      /## Current Reality[\s\S]*?(?=## Open Questions|$)/
    )?.[0] ?? "";
  const openQuestionsBlock =
    markdown.match(/## Open Questions[\s\S]*$/)?.[0] ?? "";

  const intent: WatchIntent = {
    focus: extractListAfterHeading(intentBlock, "Focus"),
    ignore: extractListAfterHeading(intentBlock, "Ignore"),
    priority: extractListAfterHeading(intentBlock, "Priority")
  };

  const sectionMatches = [
    ...realityBlock.matchAll(
      /###\s+(.+)\n<!--\s*section:\s*([a-z0-9-]+)\s*-->\n\n([\s\S]*?)(?=\n###\s+|\n##\s+|$)/g
    )
  ];

  const sections = sectionMatches.map((match) => ({
    title: match[1].trim(),
    key: match[2].trim(),
    body: match[3].trim()
  }));

  const openQuestions = openQuestionsBlock
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0 && line !== "(none)");

  return {
    targetId,
    name,
    profile: {
      description: extractField(profileBlock, "Description"),
      category: extractField(profileBlock, "Category"),
      created: extractField(profileBlock, "Created"),
      lastUpdated: extractField(profileBlock, "Last Updated")
    },
    intent,
    sections,
    openQuestions
  };
}

export function currentContextObjectKey(targetId: string): string {
  return `targets/${targetId}/current.md`;
}
