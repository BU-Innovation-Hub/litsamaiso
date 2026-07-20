import BaseEmail from "./BaseEmail";
import { Text } from "@react-email/components";

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
  status: "approved" | "rejected";
  reason?: string;
  name?: string;
  appName?: string;
  logoUrl: string;
  accentColor?: string;
  ctaUrl?: string;
};

export default function IssueStatusEmail({
  issue,
  status,
  reason,
  name,
  appName = "Litsamaiso",
  logoUrl,
  accentColor = "#535BC0",
  ctaUrl,
}: Props) {
  const title = status === "approved" ? "Your account verification has been approved" : "Your account verification requires attention";
  const greeting = name ? `Hi ${name},` : "Hi,";

  const textColor = "#f1f5f9";

  return (
    <BaseEmail
      logoUrl={logoUrl}
      appName={appName}
      title={title}
      preheader={status === "approved" ? `Your confirmation for ${issue.borrowerNumber} was approved.` : `Your submission for ${issue.borrowerNumber} was reviewed by finance.`}
      ctaText={status === "approved" ? "View Account" : "Update Submission"}
      ctaUrl={ctaUrl}
      accentColor={accentColor}
    >
      <Text style={{ color: textColor, fontSize: 16, fontWeight: 600, margin: "0 0 12px 0" }}>{greeting}</Text>

      {status === "approved" ? (
        <>
          <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px 0" }}>
            Good news — the finance team has verified and approved your submitted details for contract {issue.borrowerNumber}.
          </Text>
          <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6 }}>
            You can view your account status by clicking the button below.
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px 0" }}>
            The finance team reviewed your submission for contract {issue.borrowerNumber} and could not approve it.
          </Text>
          {reason && (
            <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px 0" }}>
              Reason: {reason}
            </Text>
          )}
          <Text style={{ color: textColor, fontSize: 14, lineHeight: 1.6 }}>
            Please update your submission with additional details or proof and resubmit for review.
          </Text>
        </>
      )}
    </BaseEmail>
  );
}
