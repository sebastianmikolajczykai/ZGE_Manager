-- Kroki równoległe: krok z parallel = 1 startuje razem z poprzednim (ten sam dzień 0, osobny limit i osoba).
-- Następny krok zaczyna się dopiero, gdy cała grupa jest odhaczona.
-- Istniejące zlecenia dostają parallel = 0, więc działają dokładnie jak dotąd (krok po kroku). Żadne dane nie są usuwane.
ALTER TABLE step_templates ADD COLUMN parallel INTEGER NOT NULL DEFAULT 0 CHECK (parallel IN (0, 1));
ALTER TABLE order_steps ADD COLUMN parallel INTEGER NOT NULL DEFAULT 0 CHECK (parallel IN (0, 1));

-- Szablon „Podział”: analiza materiałów idzie w tym samym czasie co ustalenie terminu pomiaru (rozmowa z klientem 24.11.2026).
-- Tylko gdy szablon ma te dwa kroki na pozycjach 1 i 2 (np. nie zmieniony w edytorze). Dotyczy wyłącznie nowych zleceń.
UPDATE step_templates SET parallel = 1
WHERE position = 2
  AND name = 'Analiza materiałów w urzędzie'
  AND work_type_id IN (
    SELECT work_type_id FROM step_templates WHERE position = 1 AND name = 'Ustalenie terminu pomiaru w terenie'
  );
