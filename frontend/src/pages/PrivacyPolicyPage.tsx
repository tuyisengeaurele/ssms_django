import { LegalLayout, type LegalSection } from '../landing/legal/LegalLayout';

const MAIL = 'smartsericulturerw@gmail.com';

const sections: LegalSection[] = [
  {
    title: 'Information we collect',
    body: (
      <>
        <p>We collect only what the platform needs to work:</p>
        <ul>
          <li><strong>Account data:</strong> name, email address and role (farmer, supervisor or admin).</li>
          <li><strong>Farm and batch data:</strong> farm names, locations, batch stages and the sensor readings you enter.</li>
          <li><strong>Disease check images:</strong> photos you upload for analysis are stored on Cloudinary and used only to run the disease check.</li>
          <li><strong>Usage data:</strong> actions such as batch stage changes and logins are recorded in an audit log for security and accountability.</li>
          <li><strong>Technical data:</strong> IP address, browser type and request times, collected automatically for security.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'How we use your information',
    body: (
      <>
        <ul>
          <li>To run and improve SSMS.</li>
          <li>To send alerts about your farms and batches.</li>
          <li>To run the disease check on images you upload.</li>
          <li>To detect and prevent unauthorised access or abuse.</li>
          <li>To answer messages sent through the contact form.</li>
        </ul>
        <p>We do <strong>not</strong> sell, rent or trade your personal information.</p>
      </>
    ),
  },
  {
    title: 'Data storage and security',
    body: (
      <>
        <p>
          Your data is stored in PostgreSQL databases on our hosting provider. Disease check images are stored on Cloudinary, and Cloudinary's privacy policy applies to that data. We protect your information with token based sign in, bcrypt password hashing, HTTPS in transit and HSTS headers.
        </p>
        <p>No method of storage or transmission is completely secure. If a breach is confirmed, we will tell the affected users promptly.</p>
      </>
    ),
  },
  {
    title: 'Cookies and local storage',
    body: (
      <p>
        SSMS keeps your sign in session and your language choice in your browser's local storage. We do not use tracking or advertising cookies. Because we store only these two things, the site does not show a cookie banner. You can clear local storage at any time in your browser settings.
      </p>
    ),
  },
  {
    title: 'Data retention',
    body: (
      <p>
        Account and farm data stays for as long as your account is active. Sensor readings older than 90 days may be removed automatically to save storage. Disease check images on Cloudinary stay until you ask us to delete them. Audit log entries are kept for at least 12 months.
      </p>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you.</li>
          <li><strong>Correct</strong> inaccurate data in your profile.</li>
          <li><strong>Ask us to delete</strong> your account and its data.</li>
          <li><strong>Export</strong> your harvest records as a CSV file.</li>
        </ul>
        <p>
          To use any of these rights, write to <a href={`mailto:${MAIL}`}>{MAIL}</a>.
        </p>
      </>
    ),
  },
  {
    title: 'Third party services',
    body: (
      <>
        <p>SSMS works with these outside services:</p>
        <ul>
          <li><strong>Cloudinary:</strong> image storage for disease check uploads.</li>
          <li><strong>Sentry:</strong> anonymous error monitoring. No personal data is sent.</li>
          <li><strong>Our hosting provider:</strong> servers and database.</li>
        </ul>
        <p>Each service has its own privacy policy. We share personal data with them only where the service needs it to work.</p>
      </>
    ),
  },
  {
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy. The date at the top of this page shows the latest revision. If you keep using SSMS after a change, you accept the updated policy.
      </p>
    ),
  },
  {
    title: 'Contact',
    body: (
      <p>
        Questions or concerns? Write to <a href={`mailto:${MAIL}`}>{MAIL}</a>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="October 8, 2026"
      intro={
        <>
          This policy explains how the Smart Sericulture Management System (SSMS, we, our) collects, uses and protects information about the people who use the platform. By registering or using SSMS you agree to it.
        </>
      }
      sections={sections}
      other={{ to: '/terms', label: 'Read the Terms of Service' }}
    />
  );
}
