import { Link } from 'react-router-dom';
import { LegalLayout, type LegalSection } from '../landing/legal/LegalLayout';

const MAIL = 'smartsericulturerw@gmail.com';

const sections: LegalSection[] = [
  {
    title: 'Acceptance of terms',
    body: (
      <p>
        These terms are a binding agreement between you and SSMS. If you do not agree, do not use the platform. We may update the terms at any time, and if you keep using SSMS after a change you accept it.
      </p>
    ),
  },
  {
    title: 'Eligibility',
    body: (
      <p>
        SSMS is for farmers, cooperative supervisors and administrators who work in silk farming. You must be at least 18, or have a legal guardian's consent, to create an account. You confirm that the information you give when you register is accurate and current.
      </p>
    ),
  },
  {
    title: 'Account responsibilities',
    body: (
      <ul>
        <li>Keep your sign in details confidential.</li>
        <li>Tell us straight away if someone uses your account without permission.</li>
        <li>Do not share, sell or transfer your account to another person.</li>
        <li>You are responsible for everything that happens under your account.</li>
      </ul>
    ),
  },
  {
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Upload content that is unlawful, harmful or infringes intellectual property rights.</li>
          <li>Try to reach other users' data or the platform's infrastructure without permission.</li>
          <li>Use the disease check for anything other than assessing silkworm health.</li>
          <li>Reverse engineer, scrape or exploit the platform in a way that harms the service for others.</li>
          <li>Pretend to be someone else or claim a cooperative you do not belong to.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Disease check disclaimer',
    body: (
      <p>
        The disease check is an AI tool, and like any AI tool it <strong>can make mistakes</strong>. Each result shows a confidence score. Treat the result as a quick second opinion, not a diagnosis, and consult a qualified expert before you act on it. SSMS is not a substitute for professional agricultural advice, and we accept no liability for crop or business losses that come from relying on a result.
      </p>
    ),
  },
  {
    title: 'Intellectual property',
    body: (
      <p>
        The software, design and content of SSMS belong to SSMS and its developers and are protected by intellectual property law. Your farm data and uploaded images stay yours. By uploading them you give SSMS a limited licence to process them in order to provide the service.
      </p>
    ),
  },
  {
    title: 'Data and privacy',
    body: (
      <p>
        Your use of SSMS is also covered by our <Link to="/privacy">Privacy Policy</Link>, which forms part of these terms.
      </p>
    ),
  },
  {
    title: 'Service availability',
    body: (
      <p>
        We work to keep SSMS available but cannot promise uninterrupted service. We may pause access for maintenance or in response to abuse. We are not liable for losses caused by downtime.
      </p>
    ),
  },
  {
    title: 'Termination',
    body: (
      <p>
        We may suspend or end your account if we believe you broke these terms. You may delete your account at any time by contacting us. Ending an account does not cancel rights or duties that arose before it ended.
      </p>
    ),
  },
  {
    title: 'Limitation of liability',
    body: (
      <p>
        As far as the law allows, SSMS and its developers are not liable for indirect, incidental, special or consequential damages that arise from your use of, or inability to use, the platform. This includes crop losses, data loss and business interruption.
      </p>
    ),
  },
  {
    title: 'Governing law',
    body: (
      <p>
        These terms are governed by the laws of the Republic of Rwanda. Rwandan courts have exclusive jurisdiction over any dispute.
      </p>
    ),
  },
  {
    title: 'Contact',
    body: (
      <p>
        Questions about these terms? Write to <a href={`mailto:${MAIL}`}>{MAIL}</a>.
      </p>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="October 8, 2026"
      intro={
        <>
          Please read these terms before you use the Smart Sericulture Management System (SSMS). By creating an account or using the platform you agree to be bound by them.
        </>
      }
      sections={sections}
      other={{ to: '/privacy', label: 'Read the Privacy Policy' }}
    />
  );
}
