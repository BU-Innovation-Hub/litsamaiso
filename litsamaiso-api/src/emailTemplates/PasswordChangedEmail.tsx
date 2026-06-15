import React from "react";
import BaseEmail from "./BaseEmail.js";
import { Text, Link } from "@react-email/components";

type Props = {
  name?: string | undefined;
  appName?: string | undefined;
  logoUrl?: string | undefined;
  accentColor?: string | undefined;
};

export default function PasswordChangedEmail({
  name,
  appName = "Litsamaiso",
  logoUrl,
  accentColor = "#535BC0",
}: Props) {
  const title = "Password updated successfully";
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

  return (
    <BaseEmail
      logoUrl={logoUrl}
      appName={appName}
      title={title}
      preheader={`Your ${appName} account password has been updated.`}
      accentColor={accentColor}
    >
      <Text style={greetingStyle}>{greeting}</Text>
      <Text style={textStyle}>
        This is a confirmation that your {appName} account password was successfully updated. If you made this change, no further action is required.
      </Text>
      <Text style={textStyle}>
        If you did not update your password, please contact our support team immediately at{" "}
        <Link href="mailto:support@litsamaiso.com" style={{ color: accentColor, textDecoration: "underline" }}>
          support@litsamaiso.com
        </Link>{" "}
        to secure your account.
      </Text>
    </BaseEmail>
  );
}
