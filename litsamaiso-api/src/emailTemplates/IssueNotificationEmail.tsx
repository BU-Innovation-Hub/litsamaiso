import React from "react";
import BaseEmail from "./BaseEmail.js";
import { Text, Link, Row, Column } from "@react-email/components";

type Issue = {
  _id?: string;
  borrowerNumber?: string;
  studentId?: string;
  bankName?: string;
  accountNumber?: string;
  proofUrls?: string[];
  notes?: string;
};

type Props = {
  issue: Issue;
  adminLink?: string | undefined;
  appName?: string | undefined;
  logoUrl?: string | undefined;
  accentColor?: string | undefined;
};

export default function IssueNotificationEmail({
  issue,
  adminLink,
  appName = "Litsamaiso",
  logoUrl,
  accentColor = "#535BC0",
}: Props) {
  const title = `Issue submitted — ${issue.borrowerNumber || "Unknown"}`;

  const textColor = "#f1f5f9";
  const headingStyle: React.CSSProperties = {
    color: textColor,
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 12px 0",
  };

  return (
    <BaseEmail
      logoUrl={logoUrl}
      appName={appName}
      title={title}
      preheader={`A student submitted an account verification issue for ${issue.borrowerNumber || "a contract"}.`}
      ctaText="Review Issue"
      ctaUrl={adminLink}
      accentColor={accentColor}
    >
      <Text style={headingStyle}>Hello Finance Team,</Text>

      <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        A student has submitted an account verification issue. Details are below — click the button to view and take action.
      </Text>

      <Row style={{ marginTop: 8, marginBottom: 8 }}>
        <Column>
          <Text style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0" }}>Borrower Number</Text>
          <Text style={{ color: textColor, fontSize: 15, margin: 0 }}>{issue.borrowerNumber || "-"}</Text>
        </Column>
        <Column>
          <Text style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0" }}>Student ID</Text>
          <Text style={{ color: textColor, fontSize: 15, margin: 0 }}>{issue.studentId || "-"}</Text>
        </Column>
      </Row>

      <Row style={{ marginTop: 8, marginBottom: 8 }}>
        <Column>
          <Text style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0" }}>Bank</Text>
          <Text style={{ color: textColor, fontSize: 15, margin: 0 }}>{issue.bankName || "-"}</Text>
        </Column>
        <Column>
          <Text style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0" }}>Account</Text>
          <Text style={{ color: textColor, fontSize: 15, margin: 0 }}>{issue.accountNumber || "-"}</Text>
        </Column>
      </Row>

      {issue.notes && (
        <Text style={{ color: textColor, fontSize: 14, marginTop: 12 }}>{issue.notes}</Text>
      )}

      {issue.proofUrls && issue.proofUrls.length > 0 && (
        <>
          <Text style={{ color: "#94a3b8", fontSize: 13, marginTop: 12 }}>Proofs</Text>
          {issue.proofUrls.map((u, i) => (
            <Text key={i} style={{ color: textColor, fontSize: 13, margin: "4px 0" }}>
              <Link href={u} style={{ color: accentColor, textDecoration: "underline" }}>
                View proof {i + 1}
              </Link>
            </Text>
          ))}
        </>
      )}
    </BaseEmail>
  );
}
