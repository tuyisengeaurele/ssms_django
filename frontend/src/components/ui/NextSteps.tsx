interface Step {
  title: string;
  body: string;
}

/** A short numbered list shown beside a form. Numbers are decoration; the list order carries the meaning. */
export default function NextSteps({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <aside className="next-steps">
      <h2 className="next-steps-title">{label}</h2>
      <ol aria-label={label}>
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className="next-steps-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
