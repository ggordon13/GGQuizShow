import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { answerStyle, Shape } from '../components/ui.jsx';
import { LIMITS, POINT_OPTIONS, TIME_LIMITS } from '../lib/constants.js';
import { compressImage, imageFromTransfer } from '../lib/image.js';
import { getImage, putImage } from '../lib/imageStore.js';
import { blankQuestion, newId, validateQuiz } from '../lib/quizStore.js';
import { toast } from '../lib/toast.js';

/** Add, replace or remove a question's image: click to browse, drag and drop, or paste. */
function ImagePicker({ imageId, onChange }) {
  const inputRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    getImage(imageId).then((data) => alive && setSrc(data));
    return () => {
      alive = false;
    };
  }, [imageId]);

  async function addFile(file) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      const id = newId();
      await putImage(id, dataUrl);
      onChange(id);
    } catch (err) {
      toast(err?.message || "Couldn't add that image");
    } finally {
      setBusy(false);
    }
  }

  // Pasting a screenshot anywhere in the editor adds it to the current question.
  useEffect(() => {
    const onPaste = (e) => {
      const file = imageFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      addFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const dropProps = {
    onDragOver: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      addFile(imageFromTransfer(e.dataTransfer));
    },
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      hidden
      onChange={(e) => {
        addFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  if (imageId) {
    return (
      <div className={`image-picker has-image ${dragging ? 'dragging' : ''}`} {...dropProps}>
        {src ? <img src={src} alt="Question" className="image-preview" /> : <div className="image-missing">Image not found</div>}
        <div className="image-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => inputRef.current.click()} disabled={busy}>
            {busy ? 'Processing…' : 'Replace'}
          </button>
          <button type="button" className="btn btn-danger btn-small" onClick={() => onChange(null)} disabled={busy}>
            Remove
          </button>
        </div>
        {input}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`image-picker image-drop ${dragging ? 'dragging' : ''}`}
      onClick={() => inputRef.current.click()}
      disabled={busy}
      {...dropProps}
    >
      <span className="image-drop-icon" aria-hidden="true">
        🖼️
      </span>
      <strong>{busy ? 'Processing image…' : 'Add an image'}</strong>
      <span className="muted small">Click to browse, drag a file here, or paste a screenshot</span>
      {input}
    </button>
  );
}

export default function QuizEditor({ quiz, onSave, onBack, onHost }) {
  const root = useRef(null);
  const [draft, setDraft] = useState(quiz);
  const [selected, setSelected] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const dirty = draft !== quiz;
  const issues = validateQuiz(draft);
  const question = draft.questions[selected];

  useGSAP(
    () => {
      gsap.from('.editor-main', { opacity: 0, x: 24, duration: 0.35, ease: 'power2.out' });
    },
    { scope: root, dependencies: [selected] },
  );

  const setQuestions = (fn) => setDraft((d) => ({ ...d, questions: fn(d.questions) }));
  const updateQuestion = (patch) =>
    setQuestions((qs) => qs.map((q, i) => (i === selected ? { ...q, ...patch } : q)));
  const updateAnswer = (index, patch) =>
    updateQuestion({ answers: question.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  function addQuestion() {
    if (draft.questions.length >= LIMITS.questions) return toast(`Quizzes are limited to ${LIMITS.questions} questions`);
    // New questions inherit the current time limit, which is usually what you want.
    const q = { ...blankQuestion(), timeLimit: question?.timeLimit ?? 20 };
    setQuestions((qs) => [...qs.slice(0, selected + 1), q, ...qs.slice(selected + 1)]);
    setSelected(selected + 1);
  }

  function duplicateQuestion() {
    const copy = { ...structuredClone(question), id: newId() };
    setQuestions((qs) => [...qs.slice(0, selected + 1), copy, ...qs.slice(selected + 1)]);
    setSelected(selected + 1);
  }

  function deleteQuestion() {
    if (draft.questions.length === 1) return toast('A quiz needs at least one question');
    setQuestions((qs) => qs.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
  }

  function moveQuestion(delta) {
    const target = selected + delta;
    if (target < 0 || target >= draft.questions.length) return;
    setQuestions((qs) => {
      const next = [...qs];
      [next[selected], next[target]] = [next[target], next[selected]];
      return next;
    });
    setSelected(target);
  }

  function makeTrueFalse() {
    updateQuestion({
      answers: [
        { text: 'True', correct: false },
        { text: 'False', correct: false },
        { text: '', correct: false },
        { text: '', correct: false },
      ],
    });
  }

  const save = () => {
    const saved = { ...draft, updatedAt: Date.now() };
    onSave(saved);
    setDraft(saved);
    toast('Quiz saved', 'success');
    return saved;
  };

  const host = () => {
    if (issues.length) {
      setShowIssues(true);
      return;
    }
    onHost({ ...draft, updatedAt: Date.now() });
  };

  const back = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onBack();
  };

  return (
    <section ref={root} className="editor">
      <header className="editor-bar">
        <button type="button" className="link-button" onClick={back}>
          ← Quizzes
        </button>
        <input
          className="title-input"
          placeholder="Quiz title"
          aria-label="Quiz title"
          maxLength={LIMITS.title}
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={save} disabled={!dirty}>
            {dirty ? 'Save' : 'Saved'}
          </button>
          <button type="button" className="btn btn-primary" onClick={host}>
            ▶ Host
          </button>
        </div>
      </header>

      {showIssues && issues.length > 0 && (
        <div className="card issues" role="alert">
          <strong>Fix these before hosting:</strong>
          <ul>
            {issues.slice(0, 6).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="editor-body">
        <aside className="editor-sidebar">
          <ol className="question-list">
            {draft.questions.map((q, i) => (
              <li key={q.id}>
                <button
                  type="button"
                  className={`question-item ${i === selected ? 'active' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <span className="question-num">{i + 1}</span>
                  <span className="question-preview">{q.text || <em>Untitled question</em>}</span>
                  {q.imageId && (
                    <span className="question-has-image" title="Has an image" aria-label="Has an image">
                      🖼️
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-ghost btn-block" onClick={addQuestion}>
            + Add question
          </button>
        </aside>

        {question && (
          <div className="editor-main card" key={question.id}>
            <textarea
              className="question-input"
              placeholder="Type your question"
              aria-label="Question text"
              maxLength={LIMITS.questionText}
              rows={2}
              value={question.text}
              onChange={(e) => updateQuestion({ text: e.target.value })}
            />

            <ImagePicker imageId={question.imageId} onChange={(imageId) => updateQuestion({ imageId })} />

            <div className="row gap wrap">
              <label className="field">
                <span>Time limit</span>
                <select value={question.timeLimit} onChange={(e) => updateQuestion({ timeLimit: Number(e.target.value) })}>
                  {TIME_LIMITS.map((t) => (
                    <option key={t} value={t}>
                      {t} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Points</span>
                <select value={question.points} onChange={(e) => updateQuestion({ points: Number(e.target.value) })}>
                  {POINT_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-ghost btn-small" onClick={makeTrueFalse}>
                Make True / False
              </button>
            </div>

            <div className="answer-editor-grid">
              {question.answers.map((a, i) => {
                const s = answerStyle(i);
                return (
                  <div key={i} className={`answer-editor ${a.correct ? 'is-correct' : ''}`} style={{ '--answer': s.color }}>
                    <Shape shape={s.shape} size={28} />
                    <input
                      placeholder={i < 2 ? `Answer ${i + 1}` : `Answer ${i + 1} (optional)`}
                      aria-label={`Answer ${i + 1}`}
                      maxLength={LIMITS.answerText}
                      value={a.text}
                      onChange={(e) => updateAnswer(i, { text: e.target.value })}
                    />
                    <label className="correct-toggle" title="Mark as correct">
                      <input
                        type="checkbox"
                        checked={a.correct}
                        onChange={(e) => updateAnswer(i, { correct: e.target.checked })}
                      />
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Correct answer</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <p className="muted small">Tick every answer that should count as correct.</p>

            <div className="row gap wrap editor-question-actions">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => moveQuestion(-1)} disabled={selected === 0}>
                ↑ Move up
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => moveQuestion(1)}
                disabled={selected === draft.questions.length - 1}
              >
                ↓ Move down
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={duplicateQuestion}>
                Duplicate
              </button>
              <button type="button" className="btn btn-danger btn-small" onClick={deleteQuestion}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
