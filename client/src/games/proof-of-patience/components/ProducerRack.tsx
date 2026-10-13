import { LETTERS, QUESTION_SPECS } from "../lib/pop";
import { AnswerControl, PopControl } from "./Controls";

/**
 * The producer's rack.
 *
 * Three panels, three jobs, three forms — an instrument, a gauge and a
 * running order. None of them repeats a number the canvas prints inside the
 * picture, and every cell in every one of them carries a value you can read.
 */
export function ProducerRack({
  live,
  ammoIndex,
  nextLetter,
  popMeter,
  onAnswerDown,
  onAnswerUp,
  onPopOff,
}) {
  const charge = Math.max(0, Math.min(100, Math.round(popMeter)));
  const charged = charge >= 100;

  return (
    <aside className="producer-rack" aria-label="Producer rack">
      {/* --- the instrument ------------------------------------------ */}
      <section className="panel answer-console" aria-labelledby="rack-answer">
        <div className="panel-head">
          <h2 id="rack-answer" className="panel-name">
            ANSWER QUEUE
          </h2>
          <span className="panel-meta">AUTO-LOAD</span>
        </div>
        <div className="panel-body">
          <div className="letter-rack" role="group" aria-label={`Answer sequence, next letter ${nextLetter}`}>
            {LETTERS.map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className={slotClass(index, ammoIndex)}
                aria-current={index === ammoIndex ? "step" : undefined}
              >
                {letter}
              </span>
            ))}
          </div>
          <p className="rack-note">
            Hold to answer. The rack advances S · O · O · N by itself.
          </p>
          <AnswerControl
            letter={nextLetter}
            disabled={!live}
            onDown={onAnswerDown}
            onUp={onAnswerUp}
          />
        </div>
      </section>

      {/* --- the gauge ------------------------------------------------ */}
      <section className="panel pop-console" aria-labelledby="rack-pop">
        <div className="panel-head">
          <h2 id="rack-pop" className="panel-name">
            POP-O-METER
          </h2>
          <span className="panel-meta pop-readout">
            {String(charge).padStart(3, " ")}%
          </span>
        </div>
        <div className="panel-body">
          <div
            className={charged ? "pop-gauge charged" : "pop-gauge"}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={charge}
            aria-valuetext={`${charge} percent charged`}
            aria-label="POP-o-meter charge"
          >
            <div className="gauge-track">
              <div className="gauge-fill" style={{ "--fill": `${charge}%` }} />
            </div>
            <div className="gauge-shine" aria-hidden="true" />
            <div className="gauge-ticks" aria-hidden="true" />
          </div>
          <PopControl ready={live && charged} disabled={!live || !charged} onActivate={onPopOff} />
          <p className="rack-note gauge-note">
            Full gauge clears the board.
          </p>
        </div>
      </section>

      {/* --- the running order ---------------------------------------- */}
      <section className="panel rundown-panel" aria-labelledby="rack-rundown">
        <div className="panel-head">
          <h2 id="rack-rundown" className="panel-name">
            TONIGHT&rsquo;S RUNDOWN
          </h2>
          <span className="panel-meta">{QUESTION_SPECS.length} CALLERS</span>
        </div>
        <div className="panel-body">
          <ol className="rundown">
            {QUESTION_SPECS.map((spec, index) => (
              <li key={spec.kind} className={spec.words > 1 ? "double" : undefined}>
                <span className="cue" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="caller" title={spec.label}>
                  {spec.shortLabel}
                </span>
                {/* the full question and the word count live outside the
                    truncating cell, so the visible label owns its own box */}
                <span className="sr-only">
                  {spec.label} — {spec.words} {spec.words > 1 ? "words" : "word"} to answer
                </span>
                <span className="words" aria-hidden="true">
                  &times;{spec.words}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </aside>
  );
}

function slotClass(index, ammoIndex) {
  if (index === ammoIndex) return "slot live";
  return index < ammoIndex ? "slot spent" : "slot";
}