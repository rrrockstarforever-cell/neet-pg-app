export const LETTERS = 'ABCDEFGH';
/** One MCQ. state: chosen index (or null); reveal: show right/wrong colours. */
export default function Mcq({ q, chosen, reveal, onPick, number }) {
  return (
    <div className="flex flex-col gap-space-md">
      <p className="font-body-reading text-body-reading whitespace-pre-wrap">{number != null && <b>{number}. </b>}{q.question ?? q.text}</p>
      <div className="flex flex-col gap-space-sm">
        {q.options.map((o, i) => {
          const right = i === (q.answerIndex ?? q.correct);
          const cls = reveal ? (right ? 'border-green-600 bg-green-50 text-green-900' : i === chosen ? 'border-error bg-error-container text-on-error-container' : 'border-outline-variant')
            : i === chosen ? 'border-secondary bg-secondary-container/40' : 'border-outline-variant hover:border-secondary';
          return (
            <button key={i} data-testid="option" disabled={reveal} onClick={() => onPick?.(i)} className={`text-left rounded-lg border px-space-md py-space-sm ${cls}`}>
              <b>{LETTERS[i]}.</b> {o}
            </button>
          );
        })}
      </div>
      {reveal && (q.explanation) && <p className="bg-surface-container-low rounded-lg p-space-md font-body-compact text-body-compact"><b>Explanation: </b>{q.explanation}{q.sourcePage ? ` (p.${q.sourcePage})` : ''}</p>}
    </div>
  );
}
