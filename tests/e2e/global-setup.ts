import { rmSync } from 'node:fs';

/** Każde uruchomienie testów E2E zaczyna od pustej bazy. */
export default function globalSetup(): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`e2e-data/e2e.db${suffix}`, { force: true });
}
