import React from "react";
import BaseEmail from "./BaseEmail";
import { Text, Link } from "@react-email/components";

type Props = {
  resetLink: string;
  name?: string;
  appName?: string;
  logoUrl: string;
  accentColor?: string;
};

export default function ResetPasswordEmail({
  resetLink,
  name,
  appName = "Litsamaiso",
  logoUrl,
  accentColor = "#535BC0",
}: Props) {
  const title = "Reset your password";
  const greeting = name ? `Hi ${name},` : "Hi,";

  const textColor = "#f1f5f9";
  const textStyle: React.CSSProperties = {
    color: textColor,
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 16px 0",
  };

  const greetingStyle: React.CSSProperties = {
    color: textColor,
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 16px 0",
  };

  const subtextStyle: React.CSSProperties = {
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: "1.5",
    marginTop: "24px",
  };

  return (
    <BaseEmail
      logoUrl={logoUrl}
      appName={appName}
      title={title}
      preheader={`Reset your ${appName} password using the link inside.`}
      ctaText="Reset Password"
      ctaUrl={resetLink}
      accentColor={accentColor}
    >
      <Text style={greetingStyle}>{greeting}</Text>
      <Text style={textStyle}>
        We received a request to reset your {appName} password. Click the button below to choose a new password.
      </Text>
      <Text style={textStyle}>
        If you did not request a password reset, you can safely ignore this email.
      </Text>
      <Text style={subtextStyle}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={resetLink} style={{ color: accentColor, textDecoration: "underline" }}>
          {resetLink}
        </Link>
      </Text>
    </BaseEmail>
  );
}
