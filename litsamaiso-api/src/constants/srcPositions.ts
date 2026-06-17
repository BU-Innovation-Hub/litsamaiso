export interface SrcPositionTemplate {
  title: string;
  description: string;
  displayOrder: number;
  aliases: string[];
}

export const normalizePositionLabel = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(minister|ministry|of|and|the|src|student|representative|council)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const SRC_POSITION_TEMPLATES: SrcPositionTemplate[] = [
  {
    title: "President",
    description: "SRC President",
    displayOrder: 1,
    aliases: ["president", "src president"],
  },
  {
    title: "Vice President",
    description: "SRC Vice President",
    displayOrder: 2,
    aliases: ["vice president", "deputy president", "vp"],
  },
  {
    title: "Secretary General",
    description: "SRC Secretary General",
    displayOrder: 3,
    aliases: ["secretary general", "general secretary", "sg"],
  },
  {
    title: "Minister of Finance",
    description: "SRC Minister of Finance",
    displayOrder: 4,
    aliases: ["minister of finance", "finance", "treasurer"],
  },
  {
    title: "Minister of Public and Stakeholder Relations",
    description: "SRC Minister of Public and Stakeholder Relations",
    displayOrder: 5,
    aliases: [
      "minister of public and stakeholder relations",
      "public and stakeholder relations",
      "stakeholder relations",
      "public relations",
      "pr",
    ],
  },
  {
    title: "Minister of Sports, Culture and Recreation",
    description: "SRC Minister of Sports, Culture and Recreation",
    displayOrder: 6,
    aliases: [
      "minister of sports culture and recreation",
      "sports culture and recreation",
      "sports and recreation",
      "sports",
      "culture",
      "recreation",
    ],
  },
  {
    title: "Minister of Gender and Social Welfare",
    description: "SRC Minister of Gender and Social Welfare",
    displayOrder: 7,
    aliases: [
      "minister of gender and social welfare",
      "gender and social welfare",
      "gender",
      "social welfare",
      "welfare",
    ],
  },
  {
    title: "Minister of Academics",
    description: "SRC Minister of Academics",
    displayOrder: 8,
    aliases: ["minister of academics", "academics", "academic affairs"],
  },
  {
    title: "Minister of Entertainment",
    description: "SRC Minister of Entertainment",
    displayOrder: 9,
    aliases: ["minister of entertainment", "entertainment"],
  },
  {
    title: "Administrative Secretary",
    description: "SRC Administrative Secretary",
    displayOrder: 10,
    aliases: ["administrative secretary", "admin secretary", "admin sec"],
  },
  {
    title: "Minister of Justice, Security and Infrastructure",
    description: "SRC Minister of Justice, Security and Infrastructure",
    displayOrder: 11,
    aliases: [
      "minister of justice security and infrastructure",
      "justice security and infrastructure",
      "justice and security",
      "security and infrastructure",
      "justice",
      "security",
      "infrastructure",
    ],
  },
  {
    title: "Minister of Special Needs",
    description: "SRC Minister of Special Needs",
    displayOrder: 12,
    aliases: ["minister of special needs", "special needs", "disability"],
  },
];

export const getSrcPositionTemplateByLabel = (
  value: string,
): SrcPositionTemplate | null => {
  const normalized = normalizePositionLabel(value);
  if (!normalized) return null;

  return (
    SRC_POSITION_TEMPLATES.find((template) => {
      const labels = [template.title, ...template.aliases].map((label) =>
        normalizePositionLabel(label),
      );
      return labels.some(
        (label) =>
          label === normalized ||
          normalized.includes(label) ||
          label.includes(normalized),
      );
    }) || null
  );
};
