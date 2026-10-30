import { LegalLayout, type LegalSection } from '../landing/legal/LegalLayout';

const MAIL = 'smartsericulturerw@gmail.com';

const sections: LegalSection[] = [
  {
    title: 'Information we collect',
    body: (
      <>
        <p>We collect only what the platform needs to work:</p>
        <ul>
          <li><strong>Account data:</strong> name, email address and role (farmer or supervisor), and the time you accepted the terms when you created your account.</li>
          <li><strong>Farm and batch data:</strong> farm names, the place you choose for each farm, batch stages and the sensor readings you enter. If you use "Use my location" when you add or edit a farm, the exact position of the farm is saved with it. Your cooperative's supervisors and the SSMS team can see it on a map. You can remove it from the farm form at any time.</li>
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
    title: 'The map',
    body: (
      <p>
        Supervisors can see the farms of their cooperative on a map, and the SSMS team can see them all. The map pictures come from OpenStreetMap. When you open the map, your browser asks OpenStreetMap's servers for those pictures, so they can see your IP address and the area you are looking at. They are not sent any farm name or position: the pins are drawn in your browser.
      </p>
    ),
  },
  {
    title: 'QR codes on harvest lots',
    body: (
      <>
        <p>
          A farmer can make a QR code for a harvest lot. Only the farmer who owns the lot can do this, and only on purpose. Anyone who scans the code, or opens its link, sees a short page with the farm name, the district and province, the cooperative if there is one, the breed, the dates, the weight, the silk yield and the grade. They do not need an account.
        </p>
        <p>
          The page never shows your name, your email address, the street, the exact position of the farm or your notes. Search engines are asked not to list it, and the page is not kept by browsers.
        </p>
        <p>
          You can stop sharing a lot at any time from its harvest page. The link then stops working at once, including on any code you have printed. If you share the lot again you get a new code.
        </p>
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
      updated="October 29, 2026"
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
