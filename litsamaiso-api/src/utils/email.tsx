import React from "react";
import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import ResetPasswordEmail from "../emailTemplates/ResetPasswordEmail.js";
import PasswordChangedEmail from "../emailTemplates/PasswordChangedEmail.js";
import IssueNotificationEmail from "../emailTemplates/IssueNotificationEmail.js";
import IssueStatusEmail from "../emailTemplates/IssueStatusEmail.js";
import { User } from "../models/User.js";

// Build transporter lazily at send-time so environment variables are read when needed
function buildTransporter() {
  const smtpHost = process.env.EMAIL_SMTP_HOST || process.env.EMAIL_HOST;
  const smtpPort = Number(process.env.EMAIL_SMTP_PORT || process.env.EMAIL_PORT || 587);
  const smtpUser = process.env.EMAIL_SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_PASS;
  const smtpSecure =
    (typeof process.env.EMAIL_SMTP_SECURE !== "undefined"
      ? process.env.EMAIL_SMTP_SECURE === "true"
      : typeof process.env.EMAIL_SECURE !== "undefined"
      ? process.env.EMAIL_SECURE === "true"
      : smtpPort === 465);

  // Debug logging (do not print password)
  console.info(
    `[email] SMTP config host=${smtpHost || "(none)"} port=${smtpPort} user=${smtpUser || "(none)"} secure=${smtpSecure}`,
  );

  const options: any = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
  };

  if (smtpUser && smtpPass) options.auth = { user: smtpUser, pass: smtpPass };

  return nodemailer.createTransport(options);
}

export async function sendPasswordResetEmail(opts: { to: string | string[]; resetLink: string }) {
  const appName = process.env.APP_NAME || "Litsamaiso";
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const accentColor = process.env.EMAIL_ACCENT_COLOR || "#535BC0";

  const html = await Promise.resolve(
    render(
      <ResetPasswordEmail resetLink={opts.resetLink} appName={appName} logoUrl={logoUrl} accentColor={accentColor} />,
    ),
  );

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `${appName} — Reset your password`,
    html,
  });
}

export async function sendPasswordChangedEmail(opts: { to: string | string[]; studentId: string }) {
  const appName = process.env.APP_NAME || "Litsamaiso";
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const accentColor = process.env.EMAIL_ACCENT_COLOR || "#535BC0";

  const html = await Promise.resolve(
    render(
      <PasswordChangedEmail name={opts.studentId} appName={appName} logoUrl={logoUrl} accentColor={accentColor} />,
    ),
  );

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `${appName} — Password changed`,
    html,
  });
}

export async function sendEmail(opts: { to: string | string[]; subject: string; text?: string; html?: string }) {
  const mailOptions: any = {
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
  };
  if (opts.text) mailOptions.text = opts.text;
  if (opts.html) mailOptions.html = opts.html;
  const transporter = buildTransporter();
  return transporter.sendMail(mailOptions);
}

export async function sendIssueResolvedEmail(opts: { to: string | string[]; studentId: string; institutionName?: string }) {
  const appName = process.env.APP_NAME || "Litsamaiso";
  const subject = `${opts.institutionName ? `[${opts.institutionName}] ` : ""}Account issue resolved for ${opts.studentId}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#111">
      <h2 style="margin:0 0 12px;">Account issue resolved</h2>
      <p style="margin:0 0 8px;">Your account issue for student ID <strong>${opts.studentId}</strong> has been resolved${opts.institutionName ? ` at <strong>${opts.institutionName}</strong>` : ""}.</p>
      <p style="margin:12px 0 0; color:#666; font-size:13px;">If you have any further questions, reply to this email or contact support.</p>
    </div>
  `;
  return sendEmail({ to: opts.to, subject, html });
}

export async function sendIssueStatusToStudent(issue: any, status: "approved" | "rejected", reason?: string) {
  try {
    const studentUser = await User.findOne({ studentId: issue.studentId }).select("email name").lean();
    const email = studentUser?.email || (issue as any).email;
    if (!email) {
      console.warn("[email] no student email found for issue", issue._id);
      return;
    }

    let subject = "Update on your account verification issue";
    let text = "";
    if (status === "approved") {
      subject = "Your account verification has been approved";
      text = `Good news — your submitted details for contract ${issue.contractNumber || ""} have been verified and approved by the finance team.`;
    } else {
      subject = "Action required: Issue with your account verification";
      text = `The finance team reviewed your submitted details for contract ${issue.contractNumber || ""} and could not approve them.`;
      if (reason) text += `\n\nReason: ${reason}`;
    }

    const html = `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#111"><h2 style="margin:0 0 12px;">${subject}</h2><p style="margin:0 0 8px;">${text}</p><p style="margin:12px 0 0; color:#666; font-size:13px;">If you have any further questions, reply to this email or contact support.</p></div>`;
    // Prefer pixel-matched React email template when env supports render
    try {
      const appName = process.env.APP_NAME || "Litsamaiso";
      const logoUrl = process.env.EMAIL_LOGO_URL;
      const accentColor = process.env.EMAIL_ACCENT_COLOR || "#535BC0";
      const reactHtml = await Promise.resolve(
        render(
          <IssueStatusEmail issue={issue} status={status} reason={reason} name={studentUser?.name} appName={appName} logoUrl={logoUrl} accentColor={accentColor} />,
        ),
      );
      await sendEmail({ to: email, subject, text, html: reactHtml });
    } catch (e) {
      await sendEmail({ to: email, subject, text, html });
    }
  } catch (err) {
    console.error("[email] sendIssueStatusToStudent error", err);
  }
}

export default { sendPasswordResetEmail, sendPasswordChangedEmail, sendEmail, sendIssueResolvedEmail };
