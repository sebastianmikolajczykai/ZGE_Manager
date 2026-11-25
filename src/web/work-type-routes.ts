import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { WorkType, WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import type { WorkTypeAdmin } from '../modules/work-types/work-type-admin.js';
import { html } from './html.js';
import { workTypeEditor, type EditorState } from './work-type-views.js';
import {
  applyOp,
  definitionFromDraft,
  draftFromForm,
  draftFromWorkType,
  emptyDraft,
} from './work-type-form.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_SEE_OTHER,
  message,
  type Form,
  type PageRenderer,
} from './http.js';

export interface WorkTypeWebServices {
  workTypes: WorkTypeRepository;
  workTypeAdmin: WorkTypeAdmin;
  people: PeopleRepository;
  pages: PageRenderer;
}

const TITLE = 'Rodzaj pracy';

/** Ustawienia → Rodzaje prac: edytor kroków, kopia, ukrycie, usunięcie. */
export function registerWorkTypeRoutes(
  app: FastifyInstance,
  s: WorkTypeWebServices,
  showSettingsError: (reply: FastifyReply, error: string) => unknown,
): void {
  app.get('/ustawienia/prace/nowy', (_req, reply) => render(reply, s, null, emptyDraft(), null, null));

  app.get('/ustawienia/prace/:id', (req, reply) => {
    const workType = find(s, req.params);
    if (!workType) return notFound(reply, s);
    const saved = (req.query as Form).zapisano === '1';
    return render(reply, s, workType, draftFromWorkType(workType), null, saved ? 'saved' : null);
  });

  app.post('/ustawienia/prace', (req, reply) => handleEditor(reply, s, null, req.body as Form));
  app.post('/ustawienia/prace/:id', (req, reply) => {
    const workType = find(s, req.params);
    if (!workType) return notFound(reply, s);
    return handleEditor(reply, s, workType, req.body as Form);
  });

  const action = (path: string, act: (workType: WorkType, person: string) => string) =>
    app.post(path, (req, reply) => {
      const workType = find(s, req.params);
      if (!workType) return notFound(reply, s);
      try {
        return reply.redirect(act(workType, (req.body as Form).person ?? ''), HTTP_SEE_OTHER);
      } catch (err) {
        return showSettingsError(reply, message(err));
      }
    });
  action('/ustawienia/prace/:id/kopiuj', (w, p) => `/ustawienia/prace/${s.workTypeAdmin.copy(w.id, p)}`);
  action(
    '/ustawienia/prace/:id/ukryj',
    (w, p) => (s.workTypeAdmin.setHidden(w.id, true, p), `/ustawienia/prace/${w.id}`),
  );
  action(
    '/ustawienia/prace/:id/pokaz',
    (w, p) => (s.workTypeAdmin.setHidden(w.id, false, p), `/ustawienia/prace/${w.id}`),
  );
  action(
    '/ustawienia/prace/:id/usun',
    (w, p) => (s.workTypeAdmin.remove(w.id, p), '/ustawienia#rodzaje-prac'),
  );
}

/** „Zapisz: osoba” zapisuje; inne przyciski (↑ ↓ ✕ + krok) zmieniają tylko wersję roboczą. */
function handleEditor(reply: FastifyReply, s: WorkTypeWebServices, workType: WorkType | null, form: Form) {
  const draft = draftFromForm(form);
  if (form.person === undefined) {
    return render(reply, s, workType, applyOp(draft, form.op ?? ''), null, 'unsaved');
  }
  try {
    const id = s.workTypeAdmin.save(workType?.id ?? null, definitionFromDraft(draft), form.person);
    return reply.redirect(`/ustawienia/prace/${id}?zapisano=1`, HTTP_SEE_OTHER);
  } catch (err) {
    return render(reply, s, workType, draft, message(err), null, HTTP_BAD_REQUEST);
  }
}

function render(
  reply: FastifyReply,
  s: WorkTypeWebServices,
  workType: WorkType | null,
  draft: EditorState['draft'],
  error: string | null,
  notice: EditorState['notice'],
  status = 200,
) {
  const page = workTypeEditor({ workType, draft, people: s.people.list(), error, notice });
  return s.pages.send(reply, TITLE, page, status);
}

function find(s: WorkTypeWebServices, params: unknown): WorkType | null {
  const id = Number((params as Form).id);
  return Number.isInteger(id) && id > 0 ? s.workTypes.findById(id) : null;
}

function notFound(reply: FastifyReply, s: WorkTypeWebServices) {
  const page = html`<section class="form-page">
    <p class="error" role="alert">Nie ma takiego rodzaju pracy.</p>
    <p><a href="/ustawienia#rodzaje-prac">← Ustawienia</a></p>
  </section>`;
  return s.pages.send(reply, 'Nie znaleziono', page, HTTP_NOT_FOUND);
}
