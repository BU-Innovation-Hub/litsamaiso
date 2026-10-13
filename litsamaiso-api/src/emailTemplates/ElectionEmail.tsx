import React from "react";
import { Column, Row, Section, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail.js";

// Emails sent to students as an election moves through its stages. One template with a
// variant per stage keeps the four messages consistent.

export type ElectionResultLine = {
  position: string;
  outcome: "WINNER" | "TIE" | "NO_VOTES";
  names: string[]; // winner, or the tied candidates
  votes?: number;
};

type Branding = {
  appName?: string | undefined;
  logoUrl?: string | undefined;
  accentColor?: string | undefined;
};

export type ElectionEmailProps = Branding &
  (
    | { variant: "opened"; electionTitle: string; closesAt: string; hasAccount: boolean; studentId: string; ctaUrl: string }
    | { variant: "reminder"; electionTitle: string; closesAt: string; timeLeft: string; hasAccount: boolean; studentId: string; ctaUrl: string }
    | { variant: "closed-voted"; electionTitle: string }
    | { variant: "closed-not-voted"; electionTitle: string }
    | { variant: "results"; electionTitle: string; results: ElectionResultLine[]; ctaUrl: string }
  );

const textColor = "#f1f5f9";
const mutedColor = "#94a3b8";

const Paragraph = ({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) => (
  <Text style={{ color: muted ? mutedColor : textColor, fontSize: 14, lineHeight: 1.7, margin: "0 0 14px 0" }}>{children}</Text>
);

const Strong = ({ children }: { children: React.ReactNode }) => <strong style={{ color: textColor }}>{children}</strong>;

const AccountNote = ({ hasAccount, studentId }: { hasAccount: boolean; studentId: string }) =>
  hasAccount ? null : (
    <Paragraph>
      You need a Litsamaiso account to vote. Register with your student ID <Strong>{studentId}</Strong>, then open the
      ballot.
    </Paragraph>
  );

export const electionEmailSubject = (props: ElectionEmailProps): string => {
  switch (props.variant) {
    case "opened":
      return `Voting is open: ${props.electionTitle}`;
    case "reminder":
      return `${props.timeLeft} left to vote: ${props.electionTitle}`;
    case "closed-voted":
      return `Thanks for voting: ${props.electionTitle}`;
    case "closed-not-voted":
      return `Voting has closed: ${props.electionTitle}`;
    case "results":
      return `Results are out: ${props.electionTitle}`;
  }
};

// Plain-text version for mail clients that don't render HTML
export const electionEmailText = (props: ElectionEmailProps): string => {
  switch (props.variant) {
    case "opened":
      return `Voting for ${props.electionTitle} is now open and closes on ${props.closesAt}.${
        props.hasAccount ? "" : ` Register with your student ID ${props.studentId} to vote.`
      }\n\n${props.ctaUrl}`;
    case "reminder":
      return `You haven't voted in ${props.electionTitle} yet. Voting closes on ${props.closesAt}.\n\n${props.ctaUrl}`;
    case "closed-voted":
      return `Thank you for voting in ${props.electionTitle}. Voting has closed and results will follow once they are published.`;
    case "closed-not-voted":
      return `Voting for ${props.electionTitle} has closed. Results will follow once they are published.`;
    case "results":
      return `Results for ${props.electionTitle}:\n\n${props.results
        .map((r) =>
          r.outcome === "WINNER"
            ? `${r.position}: ${r.names[0]}`
            : r.outcome === "TIE"
              ? `${r.position}: tie between ${r.names.join(" and ")}`
              : `${r.position}: no votes`,
        )
        .join("\n")}\n\n${props.ctaUrl}`;
  }
};

export default function ElectionEmail(props: ElectionEmailProps) {
  const { appName, logoUrl, accentColor } = props;
  const base = { appName, logoUrl, accentColor };

  if (props.variant === "opened") {
    return (
      <BaseEmail
        {...base}
        title={`Voting is open`}
        preheader={`${props.electionTitle} is open until ${props.closesAt}`}
        ctaText={props.hasAccount ? "Vote now" : "Create your account"}
        ctaUrl={props.ctaUrl}
      >
        <Paragraph>
          Voting for <Strong>{props.electionTitle}</Strong> is now open and closes on <Strong>{props.closesAt}</Strong>.
        </Paragraph>
        <AccountNote hasAccount={props.hasAccount} studentId={props.studentId} />
        <Paragraph muted>Your ballot is secret: it is stored separately from your identity.</Paragraph>
      </BaseEmail>
    );
  }

  if (props.variant === "reminder") {
    return (
      <BaseEmail
        {...base}
        title={`${props.timeLeft} left to vote`}
        preheader={`You haven't voted in ${props.electionTitle} yet`}
        ctaText={props.hasAccount ? "Vote now" : "Create your account"}
        ctaUrl={props.ctaUrl}
      >
        <Paragraph>
          You haven't voted in <Strong>{props.electionTitle}</Strong> yet. Voting closes on <Strong>{props.closesAt}</Strong>.
        </Paragraph>
        <AccountNote hasAccount={props.hasAccount} studentId={props.studentId} />
      </BaseEmail>
    );
  }

  if (props.variant === "closed-voted" || props.variant === "closed-not-voted") {
    const voted = props.variant === "closed-voted";
    return (
      <BaseEmail
        {...base}
        title={voted ? "Thanks for voting" : "Voting has closed"}
        preheader={`${props.electionTitle}: voting has closed`}
      >
        <Paragraph>
          {voted ? (
            <>
              Thank you for voting in <Strong>{props.electionTitle}</Strong>. Voting has now closed.
            </>
          ) : (
            <>
              Voting for <Strong>{props.electionTitle}</Strong> has closed.
            </>
          )}
        </Paragraph>
        <Paragraph muted>Results will be shared with you once they are published.</Paragraph>
      </BaseEmail>
    );
  }

  return (
    <BaseEmail
      {...base}
      title="Results are out"
      preheader={`The results for ${props.electionTitle} have been published`}
      ctaText="See full results"
      ctaUrl={props.ctaUrl}
    >
      <Paragraph>
        The results for <Strong>{props.electionTitle}</Strong> have been published.
      </Paragraph>
      <Section style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "4px 16px" }}>
        {props.results.map((line, index) => (
          <Row
            key={line.position}
            style={{ borderTop: index === 0 ? "none" : "1px solid #1e293b" }}
          >
            <Column style={{ padding: "10px 0", width: "45%", verticalAlign: "top" }}>
              <Text style={{ color: mutedColor, fontSize: 13, margin: 0 }}>{line.position}</Text>
            </Column>
            <Column style={{ padding: "10px 0", verticalAlign: "top" }}>
              <Text style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: 0 }}>
                {line.outcome === "WINNER"
                  ? line.names[0]
                  : line.outcome === "TIE"
                    ? `Tie: ${line.names.join(" and ")}`
                    : "No votes"}
              </Text>
            </Column>
          </Row>
        ))}
      </Section>
    </BaseEmail>
  );
}
