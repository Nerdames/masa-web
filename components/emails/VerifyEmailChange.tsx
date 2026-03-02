import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface VerifyEmailTemplateProps {
  userName: string;
  confirmLink: string;
}

export const VerifyEmailTemplate = ({
  userName,
  confirmLink,
}: VerifyEmailTemplateProps) => (
  <Html>
    <Head />
    <Preview>Confirm your new email address</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Email Change Request</Heading>
        <Text style={text}>Hi {userName},</Text>
        <Text style={text}>
          We received a request to change the email associated with your account. 
          To finalize this update, please click the button below:
        </Text>
        <Section style={btnContainer}>
          <Button style={button} href={confirmLink}>
            Verify New Email
          </Button>
        </Section>
        <Text style={text}>
          This link will expire in 24 hours. If you did not request this change, 
          please secure your account immediately.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>Masa Management System • Security Notification</Text>
      </Container>
    </Body>
  </Html>
);

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "20px 0 48px", width: "580px" };
const h1 = { color: "#333", fontSize: "24px", fontWeight: "bold", padding: "0", margin: "30px 0" };
const text = { color: "#333", fontSize: "16px", lineHeight: "26px" };
const btnContainer = { textAlign: "center" as const, margin: "32px 0" };
const button = { backgroundColor: "#2563eb", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: "bold", textDecoration: "none", textAlign: "center" as const, display: "block", padding: "12px" };
const hr = { borderColor: "#e6ebf1", margin: "20px 0" };
const footer = { color: "#8898aa", fontSize: "12px" };