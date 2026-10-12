import ast
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
module = ast.parse((root / 'backend/api/processors/keywords.py').read_text())
lines = ['package journal', '', 'import "strings"', '', 'func wordSet(s string) map[string]bool { result := map[string]bool{}; for _, word := range strings.Fields(s) { result[word] = true }; return result }', '']
for assignment in module.body:
    name = assignment.targets[0].id
    words = sorted(set(ast.literal_eval(assignment.value.args[0])))
    lines.append('var ' + name + ' = wordSet(' + json.dumps(' '.join(words)) + ')')
(root / 'internal/journal/keywords.go').write_text('\n'.join(lines) + '\n')
