# Scrum config
- backend: github
- capacity: 10
- base_branch: main
- sprint: 5
- github.repo: kalKun24/view-counter-game

## Definition of Done
- 受け入れ基準をすべて満たし、各基準に対応するテストがある
- 既存を含むすべてのテストが通る
- code-review 枠と security-review 枠（extra-review 枠がいればそれも）の Agent が approve している
- UI を含む PBI は UI 仕様と一致している
- スプリントのデモの台本どおりに動く（リハーサルで確かめる）
- Go の変更を含む PBI は、`make test-race` と `make vuln` の結果がレビューの報告に載っている（`make vuln` は #21 のマージの後から適用する）
