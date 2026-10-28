# Scrum config
- backend: github
- capacity: 10
- base_branch: main
- sprint: 1
- github.repo: kalKun24/view-counter-game

## Definition of Done
- 受け入れ基準をすべて満たし、各基準に対応するテストがある
- 既存を含むすべてのテストが通る
- code-review 枠と security-review 枠（extra-review 枠がいればそれも）の Agent が approve している
- UI を含む PBI は UI 仕様と一致している
- スプリントのデモの台本どおりに動く（リハーサルで確かめる）

## DoD 変更案
- （Sprint 1 の振り返り、T1-3）Go のコードを変える PBI は、`go test -race ./...` と `govulncheck ./...` を実行し、結果がレビューの報告に載っている。実行できない場合は、理由と代替の検証（並行テストの繰り返し実行など）が載っている。前提として改善 PBI #15 が必要である。
