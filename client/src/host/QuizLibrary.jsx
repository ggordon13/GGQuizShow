import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import { Logo } from '../components/ui.jsx';
import { pruneImages } from '../lib/imageStore.js';
import { blankQuiz, exportQuiz, importQuiz, newId } from '../lib/quizStore.js';
import { toast } from '../lib/toast.js';

export default function QuizLibrary({ quizzes, onHome, onCreate, onEdit, onHost, onUpdate }) {
  const root = useRef(null);
  const fileRef = useRef(null);

  useGSAP(
    () => {
      gsap.from('.quiz-card', { y: 30, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' });
    },
    { scope: root },
  );

  // Free up images that no saved quiz uses any more (replaced, or from deleted quizzes).
  useEffect(() => {
    pruneImages(quizzes.flatMap((q) => q.questions.map((x) => x.imageId)).filter(Boolean));
  }, [quizzes]);

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      toast("That file isn't a valid quiz JSON file");
      return;
    }
    try {
      const quiz = await importQuiz(raw);
      onCreate(quiz);
      toast(`Imported "${quiz.title || 'Untitled quiz'}"`, 'success');
    } catch {
      toast("Couldn't save that quiz's images. Your browser storage may be full.");
    }
  }

  const duplicate = (quiz) =>
    onUpdate((list) => [{ ...structuredClone(quiz), id: newId(), title: `${quiz.title} (copy)`, updatedAt: Date.now() }, ...list]);

  const remove = (quiz) => {
    if (window.confirm(`Delete "${quiz.title || 'Untitled quiz'}"? This can't be undone.`)) {
      onUpdate((list) => list.filter((q) => q.id !== quiz.id));
    }
  };

  return (
    <section ref={root} className="library">
      <header className="library-header">
        <button type="button" className="link-button" onClick={onHome}>
          ← Home
        </button>
        <Logo size="sm" />
        <span />
      </header>

      <div className="library-title-row">
        <h2>Your quizzes</h2>
        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current.click()}>
            Import JSON
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onCreate(blankQuiz())}>
            + New quiz
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
      </div>

      {quizzes.length === 0 && (
        <div className="card empty">
          <p>No quizzes yet. Create one to get started.</p>
        </div>
      )}

      <div className="quiz-grid">
        {quizzes.map((quiz) => (
          <article key={quiz.id} className="card quiz-card">
            <h3>{quiz.title || 'Untitled quiz'}</h3>
            <p className="muted">
              {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}
            </p>
            <div className="quiz-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => onHost(quiz)}>
                ▶ Host
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onEdit(quiz.id)}>
                Edit
              </button>
              <details className="menu">
                <summary className="btn btn-ghost" aria-label="More actions">
                  ⋯
                </summary>
                <div className="menu-list">
                  <button type="button" onClick={() => duplicate(quiz)}>
                    Duplicate
                  </button>
                  <button type="button" onClick={() => exportQuiz(quiz)}>
                    Export JSON
                  </button>
                  <button type="button" className="danger" onClick={() => remove(quiz)}>
                    Delete
                  </button>
                </div>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
