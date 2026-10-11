import React from "react";
import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail.js";

type Branding = {
  appName?: string | undefined;
  logoUrl?: string | undefined;
  accentColor?: string | undefined;
};

const textStyle: React.CSSProperties = {
  color: "#f1f5f9",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
};

const detailStyle: React.CSSProperties = { ...textStyle, margin: "0 0 6px 0" };

export function InstitutionWelcomeEmail({
  adminName,
  institutionName,
  planName,
  dashboardUrl,
  appName = "Litsamaiso",
  logoUrl,
  accentColor,
}: Branding & { adminName?: string | undefined; institutionName: string; planName: string; dashboardUrl: string }) {
  return (
    <BaseEmail
      appName={appName}
      logoUrl={logoUrl}
      accentColor={accentColor}
      title={`Welcome to ${appName}, ${institutionName}`}
      preheader={`Your ${planName} workspace is ready.`}
      ctaText="Open your dashboard"
      ctaUrl={dashboardUrl}
    >
      <Text style={textStyle}>{adminName ? `Hi ${adminName},` : "Hi,"}</Text>
      <Text style={textStyle}>
        Your payment was successful and {institutionName} is now live on the {planName} plan. You are the
        institution's Institution Admin, so you can invite your Finance, Registry and SAAD colleagues, import
        students, and manage accounts and reports.
      </Text>
      <Text style={textStyle}>
        A short guided tour will greet you when you sign in. You can replay it any time from your profile menu.
      </Text>
    </BaseEmail>
  );
}

export function NewInstitutionAlertEmail({
  institutionName,
  institutionEmail,
  adminName,
  adminEmail,
  planName,
  appName = "Litsamaiso",
  logoUrl,
  accentColor,
}: Branding & {
  institutionName: string;
  institutionEmail: string;
  adminName?: string | undefined;
  adminEmail: string;
  planName: string;
}) {
  return (
    <BaseEmail
      appName={appName}
      logoUrl={logoUrl}
      accentColor={accentColor}
      title="New institution onboarded"
      preheader={`${institutionName} subscribed to ${planName}.`}
    >
      <Text style={textStyle}>A new institution completed self-serve onboarding and payment.</Text>
      <Text style={detailStyle}>Institution: {institutionName} ({institutionEmail})</Text>
      <Text style={detailStyle}>Plan: {planName}</Text>
      <Text style={detailStyle}>
        Institution Admin: {adminName ? `${adminName} ` : ""}({adminEmail})
      </Text>
    </BaseEmail>
  );
}

export function OnboardingFailedAlertEmail({
  institutionName,
  adminEmail,
  reason,
  draftId,
  appName = "Litsamaiso",
  logoUrl,
  accentColor,
}: Branding & { institutionName: string; adminEmail: string; reason: string; draftId: string }) {
  return (
    <BaseEmail
      appName={appName}
      logoUrl={logoUrl}
      accentColor={accentColor}
      title="Action needed: paid onboarding could not be completed"
      preheader={`${institutionName} paid but their workspace was not created.`}
    >
      <Text style={textStyle}>
        A customer paid for a subscription but their workspace could not be created automatically. Please
        contact them and create the institution manually.
      </Text>
      <Text style={detailStyle}>Institution: {institutionName}</Text>
      <Text style={detailStyle}>Admin email: {adminEmail}</Text>
      <Text style={detailStyle}>Reason: {reason}</Text>
      <Text style={detailStyle}>Onboarding draft: {draftId}</Text>
    </BaseEmail>
  );
}
