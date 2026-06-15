import React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Img,
  Hr,
  Text,
  Link,
  Button,
  Preview,
} from "@react-email/components";

type Props = {
  logoUrl?: string | undefined;
  appName?: string | undefined;
  title?: string | undefined;
  preheader?: string | undefined;
  children: React.ReactNode;
  ctaText?: string | undefined;
  ctaUrl?: string | undefined;
  accentColor?: string | undefined;
};

export default function BaseEmail({
  logoUrl,
  appName = "Litsamaiso",
  title,
  preheader,
  children,
  ctaText,
  ctaUrl,
  accentColor = "#535BC0",
}: Props) {
  const outerBg = "#020618";
  const cardBg = "#0b0f19";
  const textColor = "#f1f5f9";
  const mutedColor = "#94a3b8";
  const borderStyle = "1px solid #1e293b";

  const bodyStyle: React.CSSProperties = {
    backgroundColor: outerBg,
    fontFamily:
      '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: "0",
    padding: "40px 0",
  };

  const containerStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    border: borderStyle,
    borderRadius: "12px",
    margin: "0 auto",
    padding: "40px",
    width: "560px",
    maxWidth: "100%",
  };

  const headingStyle: React.CSSProperties = {
    color: textColor,
    fontSize: "24px",
    fontWeight: "700",
    lineHeight: "1.3",
    margin: "0 0 24px 0",
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: accentColor,
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 24px",
    marginTop: "16px",
    marginBottom: "16px",
  };

  return (
    <Html>
      <Head />
      {preheader && <Preview>{preheader}</Preview>}
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header Section */}
          <Section style={{ paddingBottom: "12px" }}>
            <Row>
              <Column align="left" style={{ verticalAlign: "middle", width: "40px" }}>
                {logoUrl && <Img src={logoUrl} width="36" height="36" alt={appName} style={{ display: "block" }} />}
              </Column>
              <Column align="left" style={{ verticalAlign: "middle", paddingLeft: "12px" }}>
                <Text style={{ color: textColor, margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "0.5px" }}>
                  {appName}
                </Text>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "#1e293b", margin: "12px 0 32px 0" }} />

          {/* Main Content */}
          <Section>
            {title && <Text style={headingStyle}>{title}</Text>}
            {children}
          </Section>

          {/* Call to Action Button */}
          {ctaUrl && ctaText && (
            <Section style={{ marginTop: "24px", marginBottom: "24px" }}>
              <Button href={ctaUrl} style={buttonStyle}>
                {ctaText}
              </Button>
            </Section>
          )}

          {/* Footer Section */}
          <Section style={{ marginTop: "32px" }}>
            <Hr style={{ borderColor: "#1e293b", margin: "0 0 24px 0" }} />
            <Text style={{ color: mutedColor, fontSize: "13px", margin: "0 0 8px 0", lineHeight: "1.5" }}>
              Need help? Contact us at {" "}
              <Link href="mailto:support@litsamaiso.com" style={{ color: accentColor, textDecoration: "underline" }}>
                support@litsamaiso.com
              </Link>
            </Text>
            <Text style={{ color: mutedColor, fontSize: "13px", margin: "0" }}>
              © {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
