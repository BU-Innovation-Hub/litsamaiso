import React from "react";
import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail.js";

type Props = {
  subject: string;
  body: string;
  appName?: string | undefined;
  logoUrl?: string | undefined;
  accentColor?: string | undefined;
};

export default function AdministrativeEmail({
  subject,
  body,
  appName = "Litsamaiso",
  logoUrl,
  accentColor = "#535BC0",
}: Props) {
  const textColor = "#f1f5f9";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <BaseEmail
      logoUrl={logoUrl}
      appName={appName}
      title={subject}
      preheader={paragraphs[0] || subject}
      accentColor={accentColor}
    >
      {paragraphs.map((paragraph, index) => (
        <Text
          key={`${index}-${paragraph.slice(0, 20)}`}
          style={{
            color: textColor,
            fontSize: 14,
            lineHeight: 1.7,
            margin: "0 0 14px 0",
            whiteSpace: "pre-line",
          }}
        >
          {paragraph}
        </Text>
      ))}
    </BaseEmail>
  );
}
